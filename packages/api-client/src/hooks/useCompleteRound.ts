import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { GqlFetch } from '../client';

const COMPLETE_ROUND_MUTATION = /* GraphQL */ `
  mutation CompleteRound($roundId: ID!) {
    completeRound(roundId: $roundId) {
      coins
      earned
      already
    }
  }
`;

type CompleteRoundResult = { completeRound: { coins: number; earned: number; already: boolean | null } };

export type UseCompleteRoundParams = {
  gqlFetch: GqlFetch;
  getToken: () => Promise<string | null | undefined>;
};

export function useCompleteRound({ gqlFetch, getToken }: UseCompleteRoundParams) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (roundId: string) => {
      const token = await getToken();
      const { completeRound } = await gqlFetch<CompleteRoundResult>(COMPLETE_ROUND_MUTATION, { roundId }, token);
      return completeRound;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] }) // coins changed
  });
}
