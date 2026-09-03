import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleAuthService } from '../src/auth/google-auth.service';
import { OAuthStateStoreService } from '../src/auth/oauth-state-store.service';
import { TokenStoreService } from '../src/auth/token-store.service';

const { client, oauth2Constructor } = vi.hoisted(() => {
  const oauthClient = {
    generateAuthUrl: vi.fn(({ state }: { state: string }) => `https://accounts.google.test/?state=${state}`),
    getAccessToken: vi.fn(),
    getToken: vi.fn(),
    on: vi.fn(),
    revokeCredentials: vi.fn(),
    setCredentials: vi.fn(),
  };

  return {
    client: oauthClient,
    oauth2Constructor: vi.fn(function () {
      return oauthClient;
    }),
  };
});

vi.mock('google-auth-library', () => ({
  OAuth2Client: oauth2Constructor,
}));

describe('GoogleAuthService', () => {
  const tokenStore = {
    clear: vi.fn(),
    read: vi.fn(),
    write: vi.fn(),
  };
  const stateStore = {
    consume: vi.fn(),
    create: vi.fn(),
  };
  let service: GoogleAuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    tokenStore.read.mockResolvedValue({ refresh_token: 'refresh-token' });
    tokenStore.clear.mockResolvedValue(undefined);
    stateStore.consume.mockResolvedValue(true);
    stateStore.create.mockResolvedValue(undefined);
    client.getAccessToken.mockResolvedValue({ token: 'access-token' });

    const config = {
      get: vi.fn(() => 'configured'),
      getOrThrow: vi.fn((key: string) => key),
    } as unknown as ConfigService;

    service = new GoogleAuthService(
      config,
      tokenStore as unknown as TokenStoreService,
      stateStore as unknown as OAuthStateStoreService,
    );
  });

  it('persists OAuth state before returning the Google authorization URL', async () => {
    const url = await service.createAuthorizationUrl();

    const state = new URL(url).searchParams.get('state');
    expect(state).toMatch(/^[a-f0-9]{64}$/);
    expect(stateStore.create).toHaveBeenCalledWith(state, expect.any(Date));
  });

  it('rejects a callback whose state was not found or has expired', async () => {
    stateStore.consume.mockResolvedValue(false);

    await expect(service.handleCallback('code', 'invalid-state')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(client.getToken).not.toHaveBeenCalled();
  });

  it('validates the credentials before returning the authorized client', async () => {
    await expect(service.getAuthorizedClient()).resolves.toBe(client);

    expect(client.setCredentials).toHaveBeenCalledWith({
      refresh_token: 'refresh-token',
    });
    expect(client.getAccessToken).toHaveBeenCalledOnce();
    expect(tokenStore.clear).not.toHaveBeenCalled();
  });

  it('clears an invalid refresh token and asks the client to reconnect', async () => {
    client.getAccessToken.mockRejectedValue({
      response: { data: { error: 'invalid_grant' } },
    });

    await expect(service.getAuthorizedClient()).rejects.toEqual(
      new UnauthorizedException(
        'La connexion Google Calendar a expiré. Reconnectez Google Calendar.',
      ),
    );
    expect(tokenStore.clear).toHaveBeenCalledOnce();
  });

  it('recognizes the nested error returned by Gaxios 7', async () => {
    await expect(
      service.handleAuthError({
        cause: { message: 'invalid_grant' },
        code: 400,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(tokenStore.clear).toHaveBeenCalledOnce();
  });

  it('returns a clear error when the Google Calendar API is disabled', async () => {
    await expect(
      service.handleAuthError({
        response: {
          data: {
            error: {
              errors: [{ reason: 'accessNotConfigured' }],
            },
          },
        },
      }),
    ).rejects.toEqual(
      new ServiceUnavailableException(
        'L’API Google Calendar est désactivée dans le projet Google Cloud. Activez-la puis réessayez dans quelques minutes.',
      ),
    );

    expect(tokenStore.clear).not.toHaveBeenCalled();
  });

  it('does not hide unrelated Google authentication errors', async () => {
    const error = new Error('network unavailable');
    client.getAccessToken.mockRejectedValue(error);

    await expect(service.getAuthorizedClient()).rejects.toBe(error);
    expect(tokenStore.clear).not.toHaveBeenCalled();
  });
});
