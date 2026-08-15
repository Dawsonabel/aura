import { createYoga } from 'graphql-yoga';
import { schema, type GraphQLContext } from './schema';
import { makeDb } from './db';
import { makeRateLimiter } from './ratelimit';

export interface Env {
  DATABASE_URL: string;
  UPSTASH_REDIS_REST_URL: string;
  UPSTASH_REDIS_REST_TOKEN: string;
}

const yoga = createYoga<{ req: Request; env: Env; ip: string }>({
  schema,
  graphqlEndpoint: '/graphql',
  context: ({ env, ip }): GraphQLContext => ({
    db: makeDb(env.DATABASE_URL),
    ratelimit: makeRateLimiter(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN),
    ip
  })
});

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const ip = req.headers.get('cf-connecting-ip') || 'unknown';
    return yoga.fetch(req, { req, env, ip });
  }
};
