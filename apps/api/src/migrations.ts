/* Schema DDL — single source of truth for scripts/migrate.ts (real databases) and
   test/helpers.ts's resetDb() (disposable Neon test branches). Idempotent (IF NOT EXISTS
   throughout) so it's safe to run against a database that already has some/all of this. */
import type { NeonQueryFunction } from '@neondatabase/serverless';
import { POLL_LIB } from './pollLibrary';

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
  /* 16A's clue ladder made the sender's *grade* a paid tile; it used to be a free attribute on every
     flame. `revealed` already tracks the initial, so this is its sibling. Added as a separate ALTER
     rather than in the CREATE above so existing databases pick it up — this file runs against live
     data, not just fresh ones. Defaults false: nobody has paid for a grade retroactively. */
  await sql`ALTER TABLE votes ADD COLUMN IF NOT EXISTS grade_revealed BOOLEAN NOT NULL DEFAULT false`;

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

/* Puts the curated prompts in as *global* polls, so a school works the day it's created.

   Why this is needed at all: `buildRound` only offers polls where `school_id IS NULL` (global) or match
   the user's school. With neither, it builds a round with zero questions — and a school with no
   questions has no votes, so no aura, so an empty board. That was the live state of Lincoln High with
   17 real users on it: the app looked broken and was, in the one way nothing else could compensate for.

   **Deliberately not called by runMigrations.** resetDb() re-runs the migrations between test files, so
   seeding there would silently hand every test 16 extra global polls — and flames.test.ts reasons
   explicitly about a controlled poll set against the 12-per-round cap. Tests stay hermetic; real
   databases get this from the migrate script or the admin mutation.

   Seeds only when no global poll exists, so it's safe to re-run and won't fight an admin who has curated
   their own set. The tradeoff: an admin who deletes every global poll gets the defaults back on the next
   migrate. That's the better failure — an app with zero polls is broken, and coming back is recoverable
   where staying empty isn't. */
export async function seedDefaultPolls(sql: NeonQueryFunction<false, false>): Promise<number> {
  const existing = await sql`SELECT 1 FROM polls WHERE school_id IS NULL LIMIT 1`;
  if (existing.length > 0) return 0;

  let seeded = 0;
  for (const [emoji, text, color] of POLL_LIB) {
    const id = 'poll_' + crypto.randomUUID().slice(0, 12);
    await sql`
      INSERT INTO polls (id, emoji, text, color, enabled, school_id)
      VALUES (${id}, ${emoji}, ${text}, ${color}, true, NULL)
    `;
    seeded++;
  }
  return seeded;
}
