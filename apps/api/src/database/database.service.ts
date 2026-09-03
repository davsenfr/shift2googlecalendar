import { neon, NeonQueryFunction } from '@neondatabase/serverless';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type QueryRow = Record<string, unknown>;

@Injectable()
export class DatabaseService {
  private readonly sql: NeonQueryFunction<false, false>;

  constructor(config: ConfigService) {
    this.sql = neon(config.getOrThrow<string>('DATABASE_URL'));
  }

  async query<Row extends QueryRow>(query: string, parameters: unknown[] = []): Promise<Row[]> {
    return this.sql.query(query, parameters) as Promise<Row[]>;
  }
}
