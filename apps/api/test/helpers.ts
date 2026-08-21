/* Shared test harness. Black-box-ish: tests call the Worker's real fetch handler (same code path
   a browser or apps/web hits), never import resolvers/db functions directly — but instead of a
   subprocess/wrangler dev, they call `worker.fetch()` in-process. Nothing this Worker touches
   (Neon's HTTP driver, Upstash's REST client, @clerk/backend's verifyToken) is a Cloudflare-
   specific binding, so there's no need for the real workerd runtime just to exercise it.

   Auth: real Clerk session tokens, minted server-side via the Backend API (no browser, no OTP —
   see the Phase 6 plan for why Testing Tokens don't apply to a headless test runner). */
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';
import { createClerkClient } from '@clerk/backend';
import worker from '../src/index';
import type { Env } from '../src/schema';
import { loadDevVars } from '../src/devVars';
import { runMigrations } from '../src/migrations';

const devVarsPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.dev.vars');
const vars = loadDevVars(devVarsPath);

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || vars.TEST_DATABASE_URL;
if (!TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL is not set in apps/api/.dev.vars — point it at a disposable Neon branch. Refusing to run tests without it.');
}
if (TEST_DATABASE_URL === (process.env.DATABASE_URL || vars.DATABASE_URL)) {
  throw new Error('TEST_DATABASE_URL must not equal DATABASE_URL — tests drop and recreate every table on this database, every run.');
}

export const env: Env = {
  DATABASE_URL: TEST_DATABASE_URL,
  UPSTASH_REDIS_REST_URL: vars.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: vars.UPSTASH_REDIS_REST_TOKEN,
  CLERK_SECRET_KEY: vars.CLERK_SECRET_KEY
};

const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });

// A fake, stable-per-file IP — the `schools` query is rate-limited by IP (20/hour), and every
// call in a test file would otherwise share Node's single process identity and trip it.
const FAKE_IP = 'test-' + randomUUID().slice(0, 8);

/** Wipe the test DB and recreate the schema — same statements scripts/migrate.ts uses. */
export async function resetDb(): Promise<void> {
  const sql = neon(TEST_DATABASE_URL!);
  await sql`DROP TABLE IF EXISTS votes, reports, boosts, polls, users, schools CASCADE`;
  await runMigrations(sql);
}

/* The Worker's fetch handler takes Cloudflare's ExecutionContext so push sends can run through
   waitUntil (see src/index.ts). Under node:test there's no runtime to provide one, so this stands in
   and simply awaits nothing: a push send fired during a test would be a no-op rather than an
   unhandled rejection, and no test asserts on delivery. */
const TEST_EXECUTION_CTX = {
  waitUntil: (_p: Promise<unknown>) => {},
  passThroughOnException: () => {},
  props: {}
} as unknown as ExecutionContext;

export async function callApi(query: string, variables?: Record<string, unknown>, token?: string) {
  const res = await worker.fetch(
    new Request('http://localhost/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'cf-connecting-ip': FAKE_IP,
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ query, variables })
    }),
    env,
    TEST_EXECUTION_CTX
  );
  const body = await res.json();
  return { status: res.status, body: body as any };
}

export type TestUser = { userId: string; token: string; cleanup: () => Promise<void> };

/* Deletes whatever test users actually exist, and never throws.

   Use this in `after()` instead of bare `await user.cleanup()`. When a `before()` hook fails partway —
   a Clerk hiccup, a Neon timeout — the later users are still `undefined`, and `undefined.cleanup()`
   throws inside the teardown. That second error masks the first *and* abandons every remaining cleanup,
   so the run leaks Clerk users. Leaked users are what eventually collide on the fixed phone-number
   space and start failing whole files, so a fragile teardown quietly poisons future runs. */
export async function cleanupAll(...users: (TestUser | undefined | null)[]): Promise<void> {
  for (const u of users) {
    if (!u) continue;
    try {
      await u.cleanup();
    } catch {
      // Best effort: one undeletable user must not strand the rest.
    }
  }
}

/* Creates a real Clerk user + session server-side (no OTP) and mints a real, verifiable JWT.

   **The token is short-lived.** Clerk's default session token expires after about a minute, so a token
   minted in a file's `before()` is unusable by any test that runs more than a minute later — and these
   files take minutes. An expired token surfaces as `body.data === null` with the failure only visible
   as "[auth] token rejected" in the log, not as a thrown error, so it reads like a broken query.

   Rule of thumb: create the user (or admin) inside the test that uses it. */
export async function createTestUser(opts: { admin?: boolean } = {}): Promise<TestUser> {
  /* NANP fictional-number convention: a real area code + the reserved 555 exchange + a subscriber
     number. Clerk validates against real NANP rules, so a plain random 10-digit string (or "555" as the
     *area* code, which isn't a real one) is rejected as malformed.

     The area code is randomised across a list of real ones rather than pinned to 212. With 212 alone the
     whole space was the 4-digit subscriber — 10,000 numbers — and Clerk test users are never deleted, so
     after enough runs a collision is likely rather than rare. It surfaces as `form_identifier_exists`
     from createUser, which fails the *file* rather than a test, so it reads like a broken suite.

     This widens the space ~30x, which buys time; it does not fix the underlying leak. Old test users
     still accumulate in the Clerk instance forever and eventually need purging. */
  const AREA_CODES = [
    '212', '213', '312', '313', '404', '415', '469', '503', '512', '602',
    '617', '619', '646', '702', '713', '714', '718', '773', '801', '804',
    '817', '858', '901', '917', '925', '954', '972', '303', '206', '305'
  ];
  const area = AREA_CODES[Math.floor(Math.random() * AREA_CODES.length)];
  const phone = `+1${area}555` + String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  const user = await clerk.users.createUser({
    phoneNumber: [phone], // this apps/api's pinned @clerk/backend (^1.21.0) creates admin-added numbers pre-verified by default, no explicit status param available
    skipPasswordRequirement: true, // real sign-in is phone-OTP via Clerk's UI — tests mint sessions directly, no password needed
    publicMetadata: opts.admin ? { role: 'admin' } : undefined
  });
  const session = await clerk.sessions.createSession({ userId: user.id });
  const { jwt } = await clerk.sessions.getToken(session.id, ''); // '' = default session token, not a named JWT Template
  const cleanup = () => clerk.users.deleteUser(user.id).then(() => undefined);

  if (opts.admin) return { userId: user.id, token: jwt, cleanup }; // admins have no app-side row at all

  // GraphQL's User.id is the app-side usr_... id (created lazily on first authenticated request,
  // see getOrCreateUserByClerkId) — not Clerk's own user id. Trigger that lazy-create now so
  // callers get the id GraphQL actually uses everywhere (targetId/userId args, etc).
  const me = await callApi('{ me { id } }', undefined, jwt);
  if (me.body.errors) throw new Error('createTestUser: lazy-create failed: ' + me.body.errors[0].message);
  return { userId: me.body.data.me.id, token: jwt, cleanup };
}

/* Inserts vote rows directly, bypassing the API — for tests about what accumulated votes *become*
   (auras, boards, superlatives, flips), not about whether a vote is accepted.

   The vote mutation only accepts a target the voter's round actually served, and in a shared test
   school whether one specific person lands in a question's four weighted-random choices is a coin
   flip — aiming aggregation tests through the mutation made them flaky by construction. Eligibility
   itself stays covered black-box in voting.test.ts. Row shape matches db.createVote exactly; each
   vote lands on a different enabled poll, mirroring one voter answering distinct questions. */
export async function seedVotes(voterId: string, targetId: string, count: number): Promise<void> {
  const sql = neon(TEST_DATABASE_URL!);
  const polls = await sql`SELECT id, emoji, text, color FROM polls WHERE enabled ORDER BY created_at LIMIT ${count}`;
  if (polls.length < count) throw new Error(`seedVotes: need ${count} enabled polls, found ${polls.length}`);
  for (const p of polls) {
    await sql`
      INSERT INTO votes (id, voter_id, target_id, question_id, emoji, text, color)
      VALUES (${'vote_' + randomUUID().slice(0, 12)}, ${voterId}, ${targetId}, ${p.id}, ${p.emoji}, ${p.text}, ${p.color})
    `;
  }
}

/** Places a test user at a school via their own updateMe — schoolId is self-settable, same as onboarding. */
export async function joinSchool(token: string, schoolId: string): Promise<void> {
  const r = await callApi('mutation($schoolId:ID){ updateMe(schoolId:$schoolId){ id } }', { schoolId }, token);
  if (r.body.errors) throw new Error('joinSchool failed: ' + r.body.errors[0].message);
}

/** buildRound only offers polls that exist as real rows (unlike the static pollLibrary) — tests
    need at least a few seeded before pollRound returns any slots. */
export async function seedPolls(adminToken: string, count = 4): Promise<void> {
  for (let i = 0; i < count; i++) {
    const r = await callApi(
      'mutation($emoji:String!,$text:String!,$color:String!){ createPoll(emoji:$emoji, text:$text, color:$color){ id } }',
      { emoji: '🎯', text: `Test poll ${i}`, color: '#123456' },
      adminToken
    );
    if (r.body.errors) throw new Error('seedPolls failed: ' + r.body.errors[0].message);
  }
}
