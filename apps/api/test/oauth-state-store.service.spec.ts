import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OAuthStateStoreService } from '../src/auth/oauth-state-store.service';
import { DatabaseService } from '../src/database/database.service';

describe('OAuthStateStoreService', () => {
  const database = { query: vi.fn() };
  const service = new OAuthStateStoreService(database as unknown as DatabaseService);

  beforeEach(() => {
    vi.clearAllMocks();
    database.query.mockResolvedValue([]);
  });

  it('stores a hash instead of the OAuth state value', async () => {
    const state = 'raw-secret-state';
    const expiresAt = new Date('2030-01-01T00:00:00.000Z');

    await service.create(state, expiresAt);

    expect(database.query).toHaveBeenLastCalledWith(
      expect.stringContaining('INSERT INTO google_oauth_states'),
      [createHash('sha256').update(state).digest('hex'), expiresAt.toISOString()],
    );
  });

  it('atomically consumes a valid state only once', async () => {
    database.query.mockResolvedValue([{ state_hash: 'hash' }]);

    await expect(service.consume('state')).resolves.toBe(true);
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM google_oauth_states'),
      [createHash('sha256').update('state').digest('hex')],
    );
  });
});
