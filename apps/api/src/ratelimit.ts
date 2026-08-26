/* Replaces server.js's in-memory rlBuckets Map — that only works inside a single long-running
   Node process. Workers has no persistent memory across requests, so this state has to live
   somewhere external; Upstash's REST API is the standard fit (~2ms at the Workers edge). */
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// keyPrefix scopes every key this creates — staging and production currently share one Upstash
// database (free tier only allows one), so this prefix is the only thing keeping a beta tester's
// rate-limit window from ever colliding with a real user's. Set per environment via wrangler.toml's
// REDIS_KEY_PREFIX var (see makeRateLimiter's caller in index.ts).
export function makeRateLimiter(url: string, token: string, keyPrefix = 'aura-api') {
  const redis = new Redis({ url, token });
  // Mirrors the shape of server.js's rateLimit(key, max, windowMs) — sliding window, same semantics.
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(20, '1 h'), // matches the request-code per-IP limit as a smoke test
    prefix: keyPrefix
  });
}
export type RateLimiter = ReturnType<typeof makeRateLimiter>;
