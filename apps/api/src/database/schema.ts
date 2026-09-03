import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const googleOAuthCredentials = pgTable(
  'google_oauth_credentials',
  {
    id: text('id').primaryKey(),
    encryptedCredentials: text('encrypted_credentials').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check('google_oauth_credentials_id_check', sql`${table.id} = 'primary'`)],
);

export const googleOAuthStates = pgTable(
  'google_oauth_states',
  {
    stateHash: text('state_hash').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('google_oauth_states_expires_at_idx').on(table.expiresAt)],
);
