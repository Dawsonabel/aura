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
    env
  );
  const body = await res.json();
  return { status: res.status, body: body as any };
}

export type TestUser = { userId: string; token: string; cleanup: () => Promise<void> };

/** Creates a real Clerk user + session server-side (no OTP) and mints a real, verifiable JWT. */
export async function createTestUser(opts: { admin?: boolean } = {}): Promise<TestUser> {
  // NANP fictional-number convention: a real area code + reserved 555 exchange + random subscriber
  // — Clerk validates phone format against real NANP rules, so a plain random 10-digit string
  // (or "555" used as the area code, which isn't a real one) gets rejected as malformed.
  const phone = '+1212555' + String(Math.floor(Math.random() * 10000)).padStart(4, '0');
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
