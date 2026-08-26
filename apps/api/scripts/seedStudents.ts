/* Dev-only: fill a school with students, and give them aura to be ranked by.

   The Ranks board needs two things before it shows anything at all, and neither is reachable from the
   app: `boardFor` (src/board.ts) returns *no rows* until the school has `schoolUnlockThreshold`
   members, and then ranks whoever received votes inside the window — this week for weekly/grade, the
   last 24 hours for trending. A school under the threshold, or a school of strangers who never voted,
   renders the same empty board either way. So this script does both halves.

   Deliberately not an admin mutation, for the same reason seedAuras.ts isn't: fabricating people and
   the votes between them is exactly the power the API should never expose, not even to an admin. It
   lives here as a script that needs the database URL, so the only way to run it is to already have
   production-level access.

   Usage:  pnpm --filter api seed-students                     # list schools and their member counts
           pnpm --filter api seed-students <school> [count]    # add `count` students (default 25)
           pnpm --filter api seed-students <school> 25 --no-votes

   <school> matches on id, or case-insensitively on any part of the name ("lincoln" is enough).

   Everything it creates is an ordinary row — students are users with no `clerkUserId`, votes are
   normal votes — so the admin screens can list and delete them again.
*/
import { neon } from '@neondatabase/serverless';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadDevVars } from '../src/devVars';
import { makeDb } from '../src/db';

/* Spread across the four grades the app knows, so grade-scoped boards have someone in them. Names are
   plainly fictional but not jokes — the Ranks screen is being designed against this data, and "Test
   User 14" tells you nothing about how a real name wraps in a row. */
const FIRST = [
  'Ava', 'Noah', 'Mia', 'Liam', 'Zoe', 'Ethan', 'Layla', 'Mason', 'Ruby', 'Caleb',
  'Isla', 'Owen', 'Nora', 'Jonah', 'Elena', 'Silas', 'Maya', 'Felix', 'Iris', 'Dean',
  'Priya', 'Andre', 'Hana', 'Marcus', 'Freya', 'Omar', 'Tessa', 'Kian', 'Lena', 'Rafael',
  'Sana', 'Beau', 'Cleo', 'Nikolai', 'Amara', 'Jude', 'Talia', 'Emre', 'Wren', 'Diego'
];
const LAST = [
  'Nguyen', 'Okafor', 'Bennett', 'Alvarez', 'Kaur', 'Lindqvist', 'Moreau', 'Castillo', 'Ahmed', 'Byrne',
  'Kowalski', 'Ferreira', 'Novak', 'Tanaka', 'Hassan', 'Delgado', 'Rivas', 'Petrov', 'Mbeki', 'Salas'
];
const GRADES = ['9', '10', '11', '12'];
/* Weighted to leave a few unset. `gender` drives the Activity feed's row colour and the card accent,
   and "Rather not say" is a real option in onboarding — a cohort where everyone answered would hide
   whether the withheld path still looks right. */
const GENDERS = ['girl', 'girl', 'boy', 'boy', 'nonbinary', ''];

const pick = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];

async function main() {
  const args = process.argv.slice(2);
  const noVotes = args.includes('--no-votes');
  const positional = args.filter(a => !a.startsWith('--'));
  const schoolArg = positional[0];
  const count = Number(positional[1] || 25);

  const devVarsPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.dev.vars');
  const vars = loadDevVars(devVarsPath);
  const databaseUrl = process.env.DATABASE_URL || vars.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL not found in apps/api/.dev.vars or env');

  const db = makeDb(databaseUrl);
  const sql = neon(databaseUrl);

  const schools = (await sql`
    SELECT s.id, s.name, (SELECT COUNT(*)::int FROM users u WHERE u.school_id = s.id) AS members
    FROM schools s ORDER BY s.name
  `) as { id: string; name: string; members: number }[];

  if (!schoolArg) {
    console.log('Schools:\n');
    for (const s of schools) console.log(`  ${String(s.members).padStart(4)} members   ${s.name}   (${s.id})`);
    console.log('\nUsage: pnpm --filter api seed-students <school> [count] [--no-votes]');
    return;
  }

  const needle = schoolArg.toLowerCase();
  const matches = schools.filter(s => s.id === schoolArg || s.name.toLowerCase().includes(needle));
  if (matches.length === 0) throw new Error(`No school matching "${schoolArg}". Run with no arguments to list them.`);
  if (matches.length > 1) {
    throw new Error(`"${schoolArg}" matches ${matches.length} schools: ${matches.map(s => s.name).join(', ')}. Be more specific or pass the id.`);
  }
  const school = matches[0];
  if (!Number.isFinite(count) || count < 1) throw new Error(`Bad count: ${positional[1]}`);

  /* Usernames are looked up with a plain lower() match (findByUsername) and nothing in the database
     enforces uniqueness, so a collision wouldn't error — it would silently shadow whoever got there
     first. Existing handles are read once up front and every generated one is checked against the set. */
  const takenRows = (await sql`SELECT lower(data->>'username') AS u FROM users WHERE data->>'username' IS NOT NULL`) as { u: string }[];
  const taken = new Set(takenRows.map(r => r.u));

  console.log(`${school.name} has ${school.members} members. Adding ${count}...\n`);

  const made: { id: string; name: string }[] = [];
  for (let i = 0; i < count; i++) {
    const firstName = pick(FIRST);
    const lastName = pick(LAST);
    let username = `${firstName}${lastName}`.toLowerCase().replace(/[^a-z0-9]/g, '');
    let n = 1;
    while (taken.has(username)) username = `${firstName}${lastName}`.toLowerCase().replace(/[^a-z0-9]/g, '') + ++n;
    taken.add(username);

    const id = 'usr_' + crypto.randomUUID().slice(0, 12);
    /* Mirrors what createUser writes, minus the Clerk id — these are people who exist to be voted on,
       not to sign in, and clerk_user_id is UNIQUE but nullable so any number of them can sit at NULL.
       `onboarded: true` because a half-finished signup is a different test case than a populated
       school, and this script is for the second one. */
    const data = {
      firstName,
      lastName,
      username,
      grade: pick(GRADES),
      gender: pick(GENDERS),
      phone: '',
      coins: 2,
      infiniteAura: false,
      friendIds: [],
      onboarded: true,
      createdAt: new Date().toISOString(),
      photo: null
    };
    await sql`INSERT INTO users (id, school_id, clerk_user_id, data) VALUES (${id}, ${school.id}, NULL, ${JSON.stringify(data)})`;
    made.push({ id, name: `${firstName} ${lastName}` });
  }

  const after = (await sql`SELECT COUNT(*)::int AS n FROM users WHERE school_id = ${school.id}`) as { n: number }[];
  console.log(`Created ${made.length} students. ${school.name} now has ${after[0].n} members.`);

  if (noVotes) {
    console.log('\nSkipped votes (--no-votes). The board will be unlocked but empty until someone votes.');
    return;
  }

  /* Votes, or the board ranks nobody.

     Everyone at the school is a candidate — the new students and whoever was already there, so the
     standings aren't visibly split between "seeded" and "real" people. Timestamps are spread over the
     last ~20 hours rather than stamped `now()`: `trending` reads the last 24 hours and weekly reads
     from Monday, so a single instant would make both scopes identical and neither would show the
     ordering changing over time. */
  const everyone = (await sql`SELECT id FROM users WHERE school_id = ${school.id}`) as { id: string }[];
  const polls = (await db.getPolls()).filter(p => p.enabled && (p.schoolId === null || p.schoolId === school.id));
  if (polls.length === 0) throw new Error('No enabled polls — run `pnpm --filter api migrate` to seed them');

  /* A flat random spread ranks everyone within a vote or two of each other, which is a board with no
     shape to design against. This weights the pool so a handful of people run away with it and a long
     tail gets one or two — the distribution a real school produces, and the one that makes first place
     mean something. */
  const ranked = [...everyone].sort(() => Math.random() - 0.5);
  let votes = 0;
  for (let i = 0; i < ranked.length; i++) {
    const target = ranked[i];
    // Front of the shuffled list gets many, tail gets few — a rough power curve, floored at 0.
    const share = Math.max(0, Math.round(14 * Math.exp(-i / (ranked.length / 3.2)) - 1));
    for (let j = 0; j < share; j++) {
      const voter = pick(everyone.filter(u => u.id !== target.id));
      if (!voter) continue;
      const poll = pick(polls);
      const ts = new Date(Date.now() - Math.floor(Math.random() * 20 * 3_600_000)).toISOString();
      await sql`
        INSERT INTO votes (id, voter_id, target_id, question_id, emoji, text, color, ts)
        VALUES (${'vote_' + crypto.randomUUID().slice(0, 12)}, ${voter.id}, ${target.id}, ${poll.id},
                ${poll.emoji}, ${poll.text}, ${poll.color}, ${ts})
      `;
      votes++;
    }
  }

  console.log(`Seeded ${votes} votes across ${ranked.length} students, spread over the last 20 hours.`);
  console.log(`\nRanks unlocks at 20 members (AURA_SCHOOL_UNLOCK_THRESHOLD). ${school.name}: ${after[0].n}.`);
}

main().catch(e => {
  console.error('seed-students failed:', e);
  process.exit(1);
});
