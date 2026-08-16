import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@clerk/tanstack-react-start';
import { gqlFetch } from '../lib/graphql';

const START_ROUND_QUERY = /* GraphQL */ `
  query PollRound {
    pollRound {
      roundId
      canPlay
      polls {
        questionId
        emoji
        text
        color
        choices {
          id
          name
          boosted
        }
      }
    }
  }
`;

export type RoundChoice = { id: string; name: string; boosted: boolean | null };
export type RoundPoll = { questionId: string; emoji: string; text: string; color: string; choices: RoundChoice[] };
export type PollRound = { roundId: string; canPlay: boolean; polls: RoundPoll[] };

type StartRoundResult = { pollRound: PollRound };

/* Modeled as a mutation, not useQuery, even though `pollRound` is a GraphQL Query — it has a real
   server-side side effect (creates a fresh round) on every call, so it isn't cacheable/idempotent
   the way useQuery assumes. */
export function useStartRound() {
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const { pollRound } = await gqlFetch<StartRoundResult>(START_ROUND_QUERY, undefined, token);
      return pollRound;
    }
  });
}
