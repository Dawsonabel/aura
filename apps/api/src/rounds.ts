/* Poll "rounds" are ephemeral, high-churn, short-lived — server.js keeps them in memory and
   manually prunes anything older than 6h. Postgres would work but is the wrong tool for
   TTL-bound state; Redis (already provisioned for rate limiting) gives native expiry for free. */
import { Redis } from '@upstash/redis';

/* The built round is stored alongside its progress, which it didn't used to be.

   Without the polls in here, `pollRound` had to rebuild them on every call — so remounting the Vote
   screen silently minted a brand-new round with brand-new candidates, and a "round" was whatever the
   last render happened to produce. Storing the snapshot makes a round a real object you can resume,
   which is what lets the daily limit be counted honestly and lets a reroll replace one question
   without disturbing the rest. Structural types (not imports from pollRound) to avoid a cycle. */
export type RoundChoiceSnapshot = { id: string; name: string; boosted?: boolean };
export type RoundPollSnapshot = {
  questionId: string;
  emoji: string;
  text: string;
  color: string;
  choices: RoundChoiceSnapshot[];
};
export type Round = {
  userId: string;
  ts: string;
  answered: number;
  votedQ: string[];
  claimed: boolean;
  polls: RoundPollSnapshot[];
};

const ROUND_TTL_SECONDS = 6 * 3600; // matches server.js's 6h prune window

// keyPrefix — same reasoning as makeRateLimiter's: staging and production share one Upstash
// database, so this is what keeps their round state from ever colliding.
export function makeRoundStore(url: string, token: string, keyPrefix = 'aura-api') {
  const redis = new Redis({ url, token });
  const key = (roundId: string) => `${keyPrefix}:round:${roundId}`;

  return {
    async create(roundId: string, userId: string, polls: RoundPollSnapshot[] = []): Promise<Round> {
      const round: Round = { userId, ts: new Date().toISOString(), answered: 0, votedQ: [], claimed: false, polls };
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
