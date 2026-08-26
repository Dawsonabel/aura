/* Dev helper: hand everyone their flips back without waiting for UTC midnight.

   The flip allowance resets lazily by comparing `flipsOn` to today (see flipState in src/auras.ts),
   so clearing that key is all it takes — no counter to zero, no clock to fake. Exists because the
   alternative while building the Aura tab is waiting out a day per test pass.

   Run with: pnpm --filter api reset-flips
   Reads DATABASE_URL from apps/api/.dev.vars, same as the migrate script. Never point this at
   production: it is a debug affordance, not a product one. */
import { neon } from '@neondatabase/serverless';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadDevVars } from '../src/devVars';

async function main() {
  const devVarsPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.dev.vars');
  const vars = loadDevVars(devVarsPath);
  const databaseUrl = process.env.DATABASE_URL || vars.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL not found in apps/api/.dev.vars or env');

  const sql = neon(databaseUrl);
  const rows = await sql`
    UPDATE users SET data = (data - 'flipsOn') - 'flipsUsed'
    WHERE data ? 'flipsOn' OR data ? 'flipsUsed'
    RETURNING id
  `;
  console.log(`Flip allowance reset for ${rows.length} user(s).`);
}

main().catch(e => {
  console.error('Reset failed:', e);
  process.exit(1);
});
