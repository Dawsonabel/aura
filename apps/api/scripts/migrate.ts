/* One-time, idempotent schema migration for apps/api's new tables. Deliberately a standalone
   script rather than create-on-boot logic — Workers have no persistent boot phase to run this
   at, and explicit/deliberate migrations are the more correct pattern for the new stack anyway.

   Run with: pnpm --filter api migrate
   Reads DATABASE_URL from apps/api/.dev.vars (same format as .env). */
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

function loadDevVars(): Record<string, string> {
  const p = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.dev.vars');
  const text = readFileSync(p, 'utf8');
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    if (!line.includes('=') || line.trim().startsWith('#')) continue;
    const i = line.indexOf('=');
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

async function main() {
  const vars = loadDevVars();
  const databaseUrl = process.env.DATABASE_URL || vars.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL not found in apps/api/.dev.vars or env');
  const sql = neon(databaseUrl);

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

  console.log('Migration complete: polls, votes, reports tables ready.');
}

main().catch(e => {
  console.error('Migration failed:', e);
  process.exit(1);
});
