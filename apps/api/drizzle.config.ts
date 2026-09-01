import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

config({ path: ['.env', '../../.env'], quiet: true });

const configuredMigrationUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

if (process.argv.includes('migrate') && !configuredMigrationUrl) {
  throw new Error('Set DATABASE_URL_UNPOOLED or DATABASE_URL before applying database migrations.');
}

// Drizzle requires a syntactically valid URL while generating migrations even
// though generation does not connect to the database.
const migrationUrl =
  configuredMigrationUrl ?? 'postgresql://unused:unused@localhost:5432/unused';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/database/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: migrationUrl,
  },
});
