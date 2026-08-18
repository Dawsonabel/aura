/* Dev-only: make some classmates pick you, so there's aura to look at.

   The clue-reveal screen can't be exercised without real flames, and flames only exist when *other*
   people vote for you — which normally means signing in as each of them. This inserts the votes
   directly instead.

   Deliberately not an admin mutation: fabricating votes is exactly the power the API should never
   expose, not even to an admin. It lives here as a script that needs the database URL, so the only way
   to run it is to already have production-level access.

   Usage:  pnpm --filter api seed-flames <username> [count]
   e.g.    pnpm --filter api seed-flames tonyhawk 6

   Everything it creates is a normal vote row, so the admin Votes screen can delete them again.
*/
import { neon } from '@neondatabase/serverless';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadDevVars } from '../src/devVars';
import { makeDb } from '../src/db';

async function main() {
  const username = process.argv[2];
  const count = Number(process.argv[3] || 6);
  if (!username) throw new Error('Usage: pnpm --filter api seed-flames <username> [count]');

  const devVarsPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.dev.vars');
  const vars = loadDevVars(devVarsPath);
  const databaseUrl = process.env.DATABASE_URL || vars.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL not found in apps/api/.dev.vars or env');

  const db = makeDb(databaseUrl);
  const target = await db.findByUsername(username);
  if (!target) throw new Error(`No user with handle @${username}`);
  if (!target.schoolId) throw new Error(`@${username} has no school, so nobody can be in their polls`);

  const mates = await db.getUsersBySchool(target.schoolId, target.id);
  if (mates.length === 0) throw new Error('Nobody else at that school');

  const polls = (await db.getPolls()).filter(p => p.enabled && (p.schoolId === null || p.schoolId === target.schoolId));
  if (polls.length === 0) throw new Error('No enabled polls — run `pnpm --filter api migrate` to seed them');

  /* Spread across different voters and different prompts, and let one voter pick twice: the Inbox's
     "repeat admirer" branch and the per-prompt superlative grouping are both worth having real data for,
     and a single voter hammering one poll would exercise neither. */
  let made = 0;
  for (let i = 0; i < count; i++) {
    const voter = mates[i % mates.length];
    const poll = polls[i % polls.length];
    await db.createVote({
      id: 'vote_' + crypto.randomUUID().slice(0, 12),
      voterId: voter.id,
      targetId: target.id,
      questionId: poll.id,
      emoji: poll.emoji,
      text: poll.text,
      color: poll.color
    });
    made++;
    console.log(`  ${voter.firstName} ${voter.lastName} → "${poll.text}"`);
  }

  const sql = neon(databaseUrl);
  const [{ n }] = (await sql`SELECT COUNT(*)::int AS n FROM votes WHERE target_id = ${target.id}`) as { n: number }[];
  console.log(`\nSeeded ${made} flames for @${username}. They now have ${n} in total.`);
}

main().catch(e => {
  console.error('seed-flames failed:', e);
  process.exit(1);
});
