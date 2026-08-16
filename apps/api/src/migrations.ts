/* Schema DDL — single source of truth for scripts/migrate.ts (real databases) and
   test/helpers.ts's resetDb() (disposable Neon test branches). Idempotent (IF NOT EXISTS
   throughout) so it's safe to run against a database that already has some/all of this. */
import type { NeonQueryFunction } from '@neondatabase/serverless';

export async function runMigrations(sql: NeonQueryFunction<false, false>): Promise<void> {
  // Same shape store.ts (the frozen legacy backend) used — apps/api no longer assumes that ever ran.
  await sql`
    CREATE TABLE IF NOT EXISTS schools (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      city TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      school_id TEXT REFERENCES schools(id) ON DELETE SET NULL,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_users_school_id ON users(school_id)`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS clerk_user_id TEXT UNIQUE`;

  await sql`
    CREATE TABLE IF NOT EXISTS polls (
      id TEXT PRIMARY KEY,
      emoji TEXT NOT NULL, text TEXT NOT NULL, color TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT true,
      school_id TEXT REFERENCES schools(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_polls_school_id ON polls(school_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS votes (
      id TEXT PRIMARY KEY,
      voter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      question_id TEXT REFERENCES polls(id) ON DELETE SET NULL,
      emoji TEXT NOT NULL, text TEXT NOT NULL, color TEXT NOT NULL,
      revealed BOOLEAN NOT NULL DEFAULT false,
      unread BOOLEAN NOT NULL DEFAULT true,
      ts TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_votes_target_id ON votes(target_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_votes_voter_id ON votes(voter_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      target_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      reason TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',
      ts TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status)`;

  await sql`
    CREATE TABLE IF NOT EXISTS boosts (
      id TEXT PRIMARY KEY,
      by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      remaining INT NOT NULL,
      ts TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_boosts_by_user_id ON boosts(by_user_id)`;
}
