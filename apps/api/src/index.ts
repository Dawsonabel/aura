import { createYoga } from 'graphql-yoga';
import { schema, type GraphQLContext, type Env } from './schema';
import { makeDb } from './db';
import { makeRateLimiter } from './ratelimit';
import { makeRoundStore } from './rounds';
import { verifyClerkRequest } from './auth';

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
const yoga = createYoga<{ req: Request; env: Env; ip: string }>({
  schema,
  graphqlEndpoint: '/graphql',
  cors: false, // handled by hand in fetch() below, see corsHeaders
  context: async ({ req, env, ip }): Promise<GraphQLContext> => {
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
      isAdmin
    };
  }
});

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get('origin');
    const headers = corsHeaders(origin, env);

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });

    const ip = req.headers.get('cf-connecting-ip') || 'unknown';
    const res = await yoga.fetch(req, { req, env, ip });
    const merged = new Headers(res.headers);
    for (const [key, value] of Object.entries(headers)) merged.set(key, value as string);
    return new Response(res.body, { status: res.status, headers: merged });
  }
};
