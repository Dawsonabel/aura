/* Dev-only: give a classmate linked social handles, so the candidate sheet's socials expander has
   something to expand onto.

   Nobody's seeded account has any — handles are typed by their owner on the Me tab, and there is no
   way to type them for someone else. The expander is therefore invisible on a fresh dev database,
   which is correct behaviour and useless for looking at.

   The handles it writes are fabricated and the URLs they build will 404. That is the point: an
   unverified handle is exactly what the real feature stores (see packages/api-client/src/socials.ts —
   nothing in the app treats a handle as identity), so a fake one exercises the same path a real one
   would. Don't run this against anything but a dev database.

   Usage:  pnpm --filter api seed-socials <username> [handle]
   e.g.    pnpm --filter api seed-socials liamchen
           pnpm --filter api seed-socials liamchen thereallliam
*/
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadDevVars } from '../src/devVars';
import { makeDb } from '../src/db';

async function main() {
  const username = process.argv[2];
  if (!username) throw new Error('Usage: pnpm --filter api seed-socials <username> [handle]');
  const handle = process.argv[3] || username;

  const devVarsPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.dev.vars');
  const vars = loadDevVars(devVarsPath);
  const databaseUrl = process.env.DATABASE_URL || vars.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL not found in apps/api/.dev.vars or env');

  const db = makeDb(databaseUrl);
  const user = await db.findByUsername(username);
  if (!user) throw new Error(`No user with handle @${username}`);

  /* All three slots, because the expander's row count and its layout at more than one linked platform
     are the parts worth seeing. Merged over whatever is already there rather than replacing it. */
  const socials = {
    ...((user.socials as Record<string, string>) || {}),
    instagram: handle,
    snapchat: `${handle}.snap`,
    tiktok: `${handle}.tok`
  };
  await db.updateUser(user.id, { socials });

  console.log(`@${username} now has: ${Object.entries(socials).map(([k, v]) => `${k}=@${v}`).join(', ')}`);
}

main().catch(e => {
  console.error('seed-socials failed:', e);
  process.exit(1);
});
