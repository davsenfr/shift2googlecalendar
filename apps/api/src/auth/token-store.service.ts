import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Credentials } from 'google-auth-library';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { DatabaseService } from '../database/database.service';

const TOKEN_ID = 'primary';
const ENCRYPTION_VERSION = 'v1';

@Injectable()
export class TokenStoreService {
  private readonly encryptionKey: Buffer;

  constructor(
    config: ConfigService,
    private readonly database: DatabaseService,
  ) {
    this.encryptionKey = Buffer.from(
      config.getOrThrow<string>('TOKEN_ENCRYPTION_KEY'),
      'base64',
    );
    if (this.encryptionKey.length !== 32) {
      throw new Error('TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
    }
  }

  async read(): Promise<Credentials | null> {
    const rows = await this.database.query<{ encrypted_credentials: string }>(
      `SELECT encrypted_credentials
       FROM google_oauth_credentials
       WHERE id = $1`,
      [TOKEN_ID],
    );

    return rows[0] ? this.decrypt(rows[0].encrypted_credentials) : null;
  }

  async write(tokens: Credentials): Promise<void> {
    const current = await this.read();
    const merged = { ...current, ...tokens };

    await this.database.query(
      `INSERT INTO google_oauth_credentials (id, encrypted_credentials, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (id) DO UPDATE
       SET encrypted_credentials = EXCLUDED.encrypted_credentials,
           updated_at = NOW()`,
      [TOKEN_ID, this.encrypt(merged)],
    );
  }

  async clear(): Promise<void> {
    await this.database.query('DELETE FROM google_oauth_credentials WHERE id = $1', [TOKEN_ID]);
  }

  async hasRefreshToken(): Promise<boolean> {
    return Boolean((await this.read())?.refresh_token);
  }

  private encrypt(credentials: Credentials): string {
    const initializationVector = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, initializationVector);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(credentials), 'utf8'),
      cipher.final(),
    ]);

    return [
      ENCRYPTION_VERSION,
      initializationVector.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      ciphertext.toString('base64url'),
    ].join('.');
  }

  private decrypt(payload: string): Credentials {
    const [version, initializationVector, authenticationTag, ciphertext, ...extra] =
      payload.split('.');
    if (
      version !== ENCRYPTION_VERSION ||
      !initializationVector ||
      !authenticationTag ||
      !ciphertext ||
      extra.length > 0
    ) {
      throw new Error('Stored Google credentials have an unsupported format.');
    }

    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      Buffer.from(initializationVector, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(authenticationTag, 'base64url'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');

    return JSON.parse(plaintext) as Credentials;
  }
}
