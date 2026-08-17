import { useMutation } from '@tanstack/react-query';
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
  return useMutation({
    mutationFn: async (input: VoteInput) => {
      const token = await getToken();
      const { vote } = await gqlFetch<VoteResult>(VOTE_MUTATION, input, token);
      return vote;
    }
  });
}
