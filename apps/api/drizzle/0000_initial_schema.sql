CREATE TABLE IF NOT EXISTS "google_oauth_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"encrypted_credentials" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "google_oauth_credentials_id_check" CHECK ("google_oauth_credentials"."id" = 'primary')
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "google_oauth_states" (
	"state_hash" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "google_oauth_states_expires_at_idx" ON "google_oauth_states" USING btree ("expires_at");
