import { createYoga } from 'graphql-yoga';
import { schema, type GraphQLContext, type Env } from './schema';
import { makeDb } from './db';
import { makeRateLimiter } from './ratelimit';

// Yoga merges the initial context ({req, env, ip}, below) with whatever `context` returns — the
// schema's resolvers see that full merge, so GraphQLContext (schema.ts) has to describe the whole
// thing, not just the new db/ratelimit fields, or the two generics fight each other.
const yoga = createYoga<{ req: Request; env: Env; ip: string }>({
  schema,
  graphqlEndpoint: '/graphql',
  context: ({ req, env, ip }): GraphQLContext => ({
    req,
    env,
    ip,
    db: makeDb(env.DATABASE_URL),
    ratelimit: makeRateLimiter(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN)
  })
});

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const ip = req.headers.get('cf-connecting-ip') || 'unknown';
    return yoga.fetch(req, { req, env, ip });
  }
};
