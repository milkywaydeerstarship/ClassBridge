// Idempotent schema bootstrap: guarantees the database tables and columns exist.
// Runs automatically on the first health check, so hosting a fresh Postgres instance
// or upgrading an existing database requires zero manual migrations.
import { getPool } from "@/db";

let ensurePromise: Promise<void> | null = null;

const DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS "rooms" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "code" varchar(8) NOT NULL,
    "name" varchar(120) NOT NULL,
    "source_lang" varchar(12) NOT NULL DEFAULT 'en',
    "pin" varchar(12),
    "host_secret" varchar(64),
    "is_closed" boolean NOT NULL DEFAULT false,
    "closed_at" timestamp with time zone,
    "live_text" text,
    "live_source_lang" varchar(12),
    "live_speaker" varchar(80),
    "live_updated_at" timestamp with time zone,
    "created_at" timestamp with time zone NOT NULL DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "rooms_code_unique" ON "rooms" ("code")`,
  // Migration alterations for existing rooms tables
  `ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "host_secret" varchar(64)`,
  `ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "is_closed" boolean NOT NULL DEFAULT false`,
  `ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "closed_at" timestamp with time zone`,

  `CREATE TABLE IF NOT EXISTS "messages" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "room_id" uuid NOT NULL REFERENCES "rooms"("id") ON DELETE CASCADE,
    "original_text" text NOT NULL,
    "source_lang" varchar(12) NOT NULL DEFAULT 'en',
    "speaker_name" varchar(80) NOT NULL DEFAULT 'Speaker',
    "created_at" timestamp with time zone NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS "messages_room_created_idx" ON "messages" ("room_id", "created_at")`,

  `CREATE TABLE IF NOT EXISTS "translations" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "messageId" uuid,
    "message_id" uuid REFERENCES "messages"("id") ON DELETE CASCADE,
    "target_lang" varchar(12) NOT NULL,
    "translated_text" text NOT NULL,
    "created_at" timestamp with time zone NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS "translations_msg_lang_idx" ON "translations" ("message_id", "target_lang")`,

  `CREATE TABLE IF NOT EXISTS "presence" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "room_id" uuid NOT NULL REFERENCES "rooms"("id") ON DELETE CASCADE,
    "display_name" varchar(80) NOT NULL,
    "participant_key" varchar(64),
    "langs" varchar(120) NOT NULL DEFAULT 'en',
    "is_muted" boolean NOT NULL DEFAULT false,
    "is_kicked" boolean NOT NULL DEFAULT false,
    "is_host" boolean NOT NULL DEFAULT false,
    "last_seen" timestamp with time zone NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS "presence_room_seen_idx" ON "presence" ("room_id", "last_seen")`,
  // Migration alterations for existing presence tables
  `ALTER TABLE "presence" ADD COLUMN IF NOT EXISTS "participant_key" varchar(64)`,
  `ALTER TABLE "presence" ADD COLUMN IF NOT EXISTS "is_muted" boolean NOT NULL DEFAULT false`,
  `ALTER TABLE "presence" ADD COLUMN IF NOT EXISTS "is_kicked" boolean NOT NULL DEFAULT false`,
  `ALTER TABLE "presence" ADD COLUMN IF NOT EXISTS "is_host" boolean NOT NULL DEFAULT false`
];

export function ensureSchema(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      const pg = getPool();
      for (const stmt of DDL) {
        try {
          await pg.query(stmt);
        } catch (e) {
          console.warn("Schema init statement warning:", e);
        }
      }
    })().catch((err) => {
      // reset so the next health check retries
      ensurePromise = null;
      throw err;
    });
  }
  return ensurePromise;
}
