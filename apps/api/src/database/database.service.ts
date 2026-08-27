import { neon, NeonQueryFunction } from '@neondatabase/serverless';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type QueryRow = Record<string, unknown>;

@Injectable()
export class DatabaseService {
  private readonly sql: NeonQueryFunction<false, false>;
  private schemaPromise?: Promise<void>;

  constructor(config: ConfigService) {
    this.sql = neon(config.getOrThrow<string>('DATABASE_URL'));
  }

  async query<Row extends QueryRow>(query: string, parameters: unknown[] = []): Promise<Row[]> {
    await this.ensureSchema();
    return this.sql.query(query, parameters) as Promise<Row[]>;
  }

  private ensureSchema(): Promise<void> {
    if (!this.schemaPromise) {
      this.schemaPromise = this.createSchema().catch((error: unknown) => {
        this.schemaPromise = undefined;
        throw error;
      });
    }

    return this.schemaPromise;
  }

  private async createSchema(): Promise<void> {
    await this.sql.query(`
      CREATE TABLE IF NOT EXISTS google_oauth_credentials (
        id TEXT PRIMARY KEY CHECK (id = 'primary'),
        encrypted_credentials TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.sql.query(`
      CREATE TABLE IF NOT EXISTS google_oauth_states (
        state_hash TEXT PRIMARY KEY,
        expires_at TIMESTAMPTZ NOT NULL
      )
    `);
    await this.sql.query(`
      CREATE INDEX IF NOT EXISTS google_oauth_states_expires_at_idx
      ON google_oauth_states (expires_at)
    `);
  }
}
