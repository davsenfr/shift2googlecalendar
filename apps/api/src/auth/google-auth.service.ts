import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { randomBytes } from 'node:crypto';
import { TokenStoreService } from './token-store.service';

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
type GoogleOAuthClient = InstanceType<typeof google.auth.OAuth2>;

@Injectable()
export class GoogleAuthService {
  private readonly pendingStates = new Map<string, number>();

  constructor(
    private readonly config: ConfigService,
    private readonly tokenStore: TokenStoreService,
  ) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.get('GOOGLE_CLIENT_ID') &&
        this.config.get('GOOGLE_CLIENT_SECRET') &&
        this.config.get('GOOGLE_REDIRECT_URI'),
    );
  }

  async getStatus() {
    return {
      configured: this.isConfigured(),
      connected: this.isConfigured() && (await this.tokenStore.hasRefreshToken()),
    };
  }

  createAuthorizationUrl(): string {
    const client = this.createClient();
    this.removeExpiredStates();
    const state = randomBytes(32).toString('hex');
    this.pendingStates.set(state, Date.now() + 10 * 60_000);

    return client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: true,
      scope: [CALENDAR_SCOPE],
      state,
    });
  }

  async handleCallback(code: string, state: string): Promise<void> {
    const expiration = this.pendingStates.get(state);
    this.pendingStates.delete(state);
    if (!expiration || expiration < Date.now()) {
      throw new UnauthorizedException('État OAuth invalide ou expiré.');
    }

    const client = this.createClient();
    const { tokens } = await client.getToken(code);
    await this.tokenStore.write(tokens);
  }

  async getAuthorizedClient(): Promise<GoogleOAuthClient> {
    const client = this.createClient();
    const tokens = await this.tokenStore.read();
    if (!tokens?.refresh_token) {
      throw new UnauthorizedException('Google Calendar n’est pas connecté.');
    }

    client.setCredentials(tokens);
    client.on('tokens', (updatedTokens) => {
      void this.tokenStore.write(updatedTokens);
    });

    try {
      await client.getAccessToken();
    } catch (error) {
      return this.handleAuthError(error);
    }

    return client;
  }

  async handleAuthError(error: unknown): Promise<never> {
    if (this.isCalendarApiDisabled(error)) {
      throw new ServiceUnavailableException(
        'L’API Google Calendar est désactivée dans le projet Google Cloud. Activez-la puis réessayez dans quelques minutes.',
      );
    }

    if (!this.isInvalidGrant(error)) throw error;

    await this.tokenStore.clear();
    throw new UnauthorizedException(
      'La connexion Google Calendar a expiré. Reconnectez Google Calendar.',
    );
  }

  async disconnect(): Promise<void> {
    const tokens = await this.tokenStore.read();
    if (tokens) {
      try {
        const client = this.createClient();
        client.setCredentials(tokens);
        await client.revokeCredentials();
      } catch {
        // La suppression locale reste nécessaire même si Google a déjà révoqué le jeton.
      }
    }
    await this.tokenStore.clear();
  }

  private createClient(): GoogleOAuthClient {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'Renseignez les variables GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET et GOOGLE_REDIRECT_URI.',
      );
    }
    return new google.auth.OAuth2(
      this.config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      this.config.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      this.config.getOrThrow<string>('GOOGLE_REDIRECT_URI'),
    );
  }

  private removeExpiredStates() {
    const now = Date.now();
    for (const [state, expiration] of this.pendingStates) {
      if (expiration < now) this.pendingStates.delete(state);
    }
  }

  private isInvalidGrant(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;

    const oauthError = error as {
      code?: string;
      cause?: { message?: string };
      message?: string;
      response?: { data?: { error?: string } };
    };

    return oauthError.code === 'invalid_grant' ||
      oauthError.cause?.message === 'invalid_grant' ||
      oauthError.message === 'invalid_grant' ||
      oauthError.response?.data?.error === 'invalid_grant';
  }

  private isCalendarApiDisabled(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;

    const googleError = error as {
      cause?: { errors?: Array<{ reason?: string }> };
      response?: {
        data?: {
          error?: {
            errors?: Array<{ reason?: string }>;
          };
        };
      };
    };
    const reasons = [
      ...(googleError.cause?.errors ?? []),
      ...(googleError.response?.data?.error?.errors ?? []),
    ];

    return reasons.some(({ reason }) => reason === 'accessNotConfigured');
  }
}
