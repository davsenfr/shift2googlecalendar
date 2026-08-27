import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TokenStoreService } from '../src/auth/token-store.service';
import { DatabaseService } from '../src/database/database.service';

describe('TokenStoreService', () => {
  let encryptedCredentials: string | undefined;
  const database = { query: vi.fn() };
  let service: TokenStoreService;

  beforeEach(() => {
    vi.clearAllMocks();
    encryptedCredentials = undefined;
    database.query.mockImplementation((query: string, parameters: unknown[]) => {
      if (query.includes('SELECT encrypted_credentials')) {
        return Promise.resolve(
          encryptedCredentials ? [{ encrypted_credentials: encryptedCredentials }] : [],
        );
      }
      if (query.includes('INSERT INTO google_oauth_credentials')) {
        encryptedCredentials = parameters[1] as string;
      }
      if (query.includes('DELETE FROM google_oauth_credentials')) {
        encryptedCredentials = undefined;
      }
      return Promise.resolve([]);
    });

    const config = {
      getOrThrow: vi.fn(() => Buffer.alloc(32, 7).toString('base64')),
    } as unknown as ConfigService;
    service = new TokenStoreService(config, database as unknown as DatabaseService);
  });

  it('encrypts credentials before persisting them and can read them back', async () => {
    await service.write({ access_token: 'access-secret', refresh_token: 'refresh-secret' });

    expect(encryptedCredentials).toMatch(/^v1\./);
    expect(encryptedCredentials).not.toContain('refresh-secret');
    await expect(service.read()).resolves.toMatchObject({
      access_token: 'access-secret',
      refresh_token: 'refresh-secret',
    });
  });

  it('merges token refresh updates without losing the refresh token', async () => {
    await service.write({ refresh_token: 'refresh-secret' });
    await service.write({ access_token: 'new-access-secret' });

    await expect(service.read()).resolves.toMatchObject({
      access_token: 'new-access-secret',
      refresh_token: 'refresh-secret',
    });
  });

  it('deletes persisted credentials', async () => {
    await service.write({ refresh_token: 'refresh-secret' });
    await service.clear();

    await expect(service.read()).resolves.toBeNull();
  });
});
