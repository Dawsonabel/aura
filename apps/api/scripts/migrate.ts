/* One-time, idempotent schema migration for apps/api. Deliberately a standalone script rather
   than create-on-boot logic — Workers have no persistent boot phase to run this at, and
   explicit/deliberate migrations are the more correct pattern for the new stack anyway.

   Run with: pnpm --filter api migrate
   Reads DATABASE_URL from apps/api/.dev.vars (same format as .env). */
import { neon } from '@neondatabase/serverless';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadDevVars } from '../src/devVars';
import { runMigrations, seedDefaultPolls } from '../src/migrations';

async function main() {
  const devVarsPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.dev.vars');
  const vars = loadDevVars(devVarsPath);
  const databaseUrl = process.env.DATABASE_URL || vars.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL not found in apps/api/.dev.vars or env');

  const sql = neon(databaseUrl);
  await runMigrations(sql);
  console.log('Migration complete: schools, users, polls, votes, reports, boosts tables ready.');

  /* Seeded here rather than inside runMigrations, which the test harness also runs — see the note on
     seedDefaultPolls. A no-op once any global poll exists. */
  const seeded = await seedDefaultPolls(sql);
  console.log(
    seeded > 0
      ? `Seeded ${seeded} default polls (global). Every school can build a round now.`
      : 'Default polls already present — nothing seeded.'
  );
}

main().catch(e => {
  console.error('Migration failed:', e);
  process.exit(1);
});
