import { useMutation } from '@tanstack/react-query';
import type { GqlFetch } from '../client';

const START_ROUND_QUERY = /* GraphQL */ `
  query PollRound {
    pollRound {
      roundId
      canPlay
      roundsLeft
      dailyLimit
      nextRoundAt
      rerollCost
      roundPayout
      followWeightFactor
      votesToday
      polls {
        questionId
        emoji
        text
        color
        choices {
          id
          name
          grade
          boosted
        }
      }
    }
  }
`;

export type RoundChoice = {
  id: string;
  name: string;
  /** Their school year, for the card's meta line. Null if they never set one. */
  grade: string | null;
  boosted: boolean | null;
};
export type RoundPoll = { questionId: string; emoji: string; text: string; color: string; choices: RoundChoice[] };
export type PollRound = {
  roundId: string;
  canPlay: boolean;
  polls: RoundPoll[];
  /** Rounds still available today, out of dailyLimit. 0 with no polls is the out-of-rounds state. */
  roundsLeft: number;
  dailyLimit: number;
  /** ISO time the allowance refills (next UTC midnight). */
  nextRoundAt: string;
  /** Coins a reroll costs. Server-owned so the UI can't display a stale price. */
  rerollCost: number;
  /** Coins finishing this round pays, God Mode rate included. */
  roundPayout: number;
  /** Votes cast today — the out-of-rounds screen's "N votes cast today". */
  votesToday: number;
  /** How many times likelier a followed classmate is than a stranger. Server-owned, same as prices. */
  followWeightFactor: number;
};

type StartRoundResult = { pollRound: PollRound };

export type UseStartRoundParams = {
  gqlFetch: GqlFetch;
  getToken: () => Promise<string | null | undefined>;
};

/* Modeled as a mutation, not useQuery, even though `pollRound` is a GraphQL Query — it has a real
   server-side side effect (creates a fresh round) on every call, so it isn't cacheable/idempotent
   the way useQuery assumes. */
export function useStartRound({ gqlFetch, getToken }: UseStartRoundParams) {
  return useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const { pollRound } = await gqlFetch<StartRoundResult>(START_ROUND_QUERY, undefined, token);
      return pollRound;
    }
  });
}
