import { createYoga } from 'graphql-yoga';
import { schema, type GraphQLContext, type Env } from './schema';
import { makeDb } from './db';
import { makeRateLimiter } from './ratelimit';
import { makeRoundStore } from './rounds';
import { verifyClerkRequest } from './auth';

// Yoga merges the initial context ({req, env, ip}, below) with whatever `context` returns — the
// schema's resolvers see that full merge, so GraphQLContext (schema.ts) has to describe the whole
// thing, not just the new db/ratelimit/rounds/me fields, or the two generics fight each other.
const yoga = createYoga<{ req: Request; env: Env; ip: string }>({
  schema,
  graphqlEndpoint: '/graphql',
  context: async ({ req, env, ip }): Promise<GraphQLContext> => {
    const db = makeDb(env.DATABASE_URL);

    // No webhook-based sync in this phase (see plan: wrangler dev can't receive one on localhost) —
    // lazily create the app-side users row on first authenticated request instead.
    const claims = await verifyClerkRequest(req, env.CLERK_SECRET_KEY);
    let me = null;
    if (claims?.sub) {
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
      me
    };
  }
});

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const ip = req.headers.get('cf-connecting-ip') || 'unknown';
    return yoga.fetch(req, { req, env, ip });
  }
};
