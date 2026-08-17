import { createYoga } from 'graphql-yoga';
import { schema, type GraphQLContext, type Env } from './schema';
import { makeDb } from './db';
import { makeRateLimiter } from './ratelimit';
import { makeRoundStore } from './rounds';
import { verifyClerkRequest } from './auth';
import { sendRoundAnnouncement } from './push';
import { resolveTuning } from './tuning';

const DEV_ORIGIN = 'http://localhost:3000'; // apps/web's Vite dev server, see apps/web/vite.config.ts

// Yoga's own `cors` option only sees the Request, not the per-request `env` Cloudflare hands the
// fetch handler — so ALLOWED_ORIGIN (set as a Worker secret/var in prod, unset in dev) can't be
// read there. CORS is handled by hand below instead, in the fetch handler where env is in scope.
function corsHeaders(origin: string | null, env: Env): HeadersInit {
  const allowed = origin && (origin === DEV_ORIGIN || origin === env.ALLOWED_ORIGIN);
  return {
    'Access-Control-Allow-Origin': allowed ? origin : DEV_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    Vary: 'Origin'
  };
}

// Yoga merges the initial context ({req, env, ip}, below) with whatever `context` returns — the
// schema's resolvers see that full merge, so GraphQLContext (schema.ts) has to describe the whole
// thing, not just the new db/ratelimit/rounds/me fields, or the two generics fight each other.
const yoga = createYoga<{ req: Request; env: Env; ip: string; waitUntil: (p: Promise<unknown>) => void }>({
  schema,
  graphqlEndpoint: '/graphql',
  cors: false, // handled by hand in fetch() below, see corsHeaders
  // Every resolver throws plain `Error`s with deliberately user-facing messages ("Not logged in",
  // "Admin only", age/eligibility validation, ...) — the same convention server.js used, returning
  // `e.message` directly in its JSON error responses. Yoga's default error masking would otherwise
  // flatten all of these to a generic "Unexpected error." before they reach the client.
  maskedErrors: { maskError: (error, message) => (error instanceof Error ? error : new Error(message)) },
  context: async ({ req, env, ip, waitUntil }): Promise<GraphQLContext> => {
    const db = makeDb(env.DATABASE_URL);

    const claims = await verifyClerkRequest(req, env.CLERK_SECRET_KEY);
    // `role` arrives as a custom session-token claim, see auth.ts — checked first so the lazy-create
    // below can skip admin identities, which authenticate via the same Clerk token but don't get/need
    // a student profile row.
    const isAdmin = claims?.role === 'admin';

    // No webhook-based sync in this phase (see plan: wrangler dev can't receive one on localhost) —
    // lazily create the app-side users row on first authenticated non-admin request instead.
    let me = null;
    if (claims?.sub && !isAdmin) {
      const phone = typeof claims.phone_number === 'string' ? claims.phone_number : null;
      me = await db.getOrCreateUserByClerkId(claims.sub, phone, 'usr_' + crypto.randomUUID().slice(0, 12));
    }

    return {
      req,
      env,
      ip,
      db,
      ratelimit: makeRateLimiter(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN),
      rounds: makeRoundStore(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN),
      me,
      isAdmin,
      waitUntil,
      /* Resolved per request so a dashboard variable change takes effect on the next call — no deploy,
         no restart. Cheap: it's a handful of Number() casts over an object already in memory. */
      tuning: resolveTuning(env as unknown as Record<string, unknown>)
    };
  }
});

export default {
  /* `ctx` is threaded through purely for `waitUntil`: push sends (src/push.ts) must not add their
     network latency to a vote, and must not be able to fail one either. An unawaited promise in a
     Worker is cancelled the moment the response returns, so fire-and-forget only actually works via
     waitUntil — which is why the context carries it rather than resolvers calling fetch loosely. */
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const origin = req.headers.get('origin');
    const headers = corsHeaders(origin, env);

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });

    const ip = req.headers.get('cf-connecting-ip') || 'unknown';
    const res = await yoga.fetch(req, { req, env, ip, waitUntil: p => ctx.waitUntil(p) });
    const merged = new Headers(res.headers);
    for (const [key, value] of Object.entries(headers)) merged.set(key, value as string);
    return new Response(res.body, { status: res.status, headers: merged });
  },

  /* The daily "round is live" push (7A). Schedule lives in wrangler.toml; locally you can fire it
     without waiting for the clock:
       curl "http://127.0.0.1:8787/cdn-cgi/handler/scheduled"  */
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(sendRoundAnnouncement(makeDb(env.DATABASE_URL)));
  }
};
