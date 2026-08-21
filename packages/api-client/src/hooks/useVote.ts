import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { GqlFetch } from '../client';

const VOTE_MUTATION = /* GraphQL */ `
  mutation Vote($questionId: ID!, $targetId: ID!, $roundId: ID!) {
    vote(questionId: $questionId, targetId: $targetId, roundId: $roundId) {
      ok
      dup
    }
  }
`;

export type VoteInput = { questionId: string; targetId: string; roundId: string };
type VoteResult = { vote: { ok: boolean; dup: boolean | null } };

export type UseVoteParams = {
  gqlFetch: GqlFetch;
  getToken: () => Promise<string | null | undefined>;
};

export function useVote({ gqlFetch, getToken }: UseVoteParams) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: VoteInput) => {
      const token = await getToken();
      const { vote } = await gqlFetch<VoteResult>(VOTE_MUTATION, input, token);
      return vote;
    },
    /* A vote now pays, so it moves the balance — same reason useCompleteRound and useRerollQuestion
       do this. It didn't need to before: voting was free and the balance only ever changed at the end
       of a round. Without it the Re-Roll chip sits on a stale number while the server credits every
       vote, which is the one place on this screen the count is on screen as it changes.

       Fires on a duplicate vote too, which is a wasted refetch of a small query rather than a wrong
       number — the alternative is teaching this hook what the server does about dups. */
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] })
  });
}
