/* Poll "rounds" are ephemeral, high-churn, short-lived — server.js keeps them in memory and
   manually prunes anything older than 6h. Postgres would work but is the wrong tool for
   TTL-bound state; Redis (already provisioned for rate limiting) gives native expiry for free. */
import { Redis } from '@upstash/redis';

export type Round = { userId: string; ts: string; answered: number; votedQ: string[]; claimed: boolean };

const ROUND_TTL_SECONDS = 6 * 3600; // matches server.js's 6h prune window

export function makeRoundStore(url: string, token: string) {
  const redis = new Redis({ url, token });
  const key = (roundId: string) => `round:${roundId}`;

  return {
    async create(roundId: string, userId: string): Promise<Round> {
      const round: Round = { userId, ts: new Date().toISOString(), answered: 0, votedQ: [], claimed: false };
      await redis.set(key(roundId), round, { ex: ROUND_TTL_SECONDS });
      return round;
    },
    async get(roundId: string): Promise<Round | null> {
      return (await redis.get<Round>(key(roundId))) ?? null;
    },
    /** Overwrites the round, refreshing its TTL — matches server.js treating a round as alive as long as it's active. */
    async save(roundId: string, round: Round): Promise<void> {
      await redis.set(key(roundId), round, { ex: ROUND_TTL_SECONDS });
    }
  };
}
export type RoundStore = ReturnType<typeof makeRoundStore>;
