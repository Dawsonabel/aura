import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/tanstack-react-start';
import { gqlFetch } from '../lib/graphql';

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

export function useCompleteRound() {
  const { getToken } = useAuth();
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
