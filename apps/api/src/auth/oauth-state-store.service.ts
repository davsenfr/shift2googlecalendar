import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class OAuthStateStoreService {
  constructor(private readonly database: DatabaseService) {}

  async create(state: string, expiresAt: Date): Promise<void> {
    await this.database.query('DELETE FROM google_oauth_states WHERE expires_at <= NOW()');
    await this.database.query(
      `INSERT INTO google_oauth_states (state_hash, expires_at)
       VALUES ($1, $2)
       ON CONFLICT (state_hash) DO UPDATE SET expires_at = EXCLUDED.expires_at`,
      [this.hash(state), expiresAt.toISOString()],
    );
  }

  async consume(state: string): Promise<boolean> {
    const rows = await this.database.query<{ state_hash: string }>(
      `DELETE FROM google_oauth_states
       WHERE state_hash = $1 AND expires_at > NOW()
       RETURNING state_hash`,
      [this.hash(state)],
    );

    return rows.length === 1;
  }

  private hash(state: string): string {
    return createHash('sha256').update(state).digest('hex');
  }
}
