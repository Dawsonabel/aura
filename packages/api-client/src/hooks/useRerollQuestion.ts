import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { GqlFetch } from '../client';
import type { RoundChoice } from './useStartRound';

const REROLL_MUTATION = /* GraphQL */ `
  mutation RerollQuestion($roundId: ID!, $questionId: ID!) {
    rerollQuestion(roundId: $roundId, questionId: $questionId) {
      coins
      choices {
        id
        name
        grade
        boosted
      }
    }
  }
`;

export type RerollInput = { roundId: string; questionId: string };
export type RerollResult = { coins: number; choices: RoundChoice[] };

export type UseRerollQuestionParams = {
  gqlFetch: GqlFetch;
  getToken: () => Promise<string | null | undefined>;
};

/** Paid reroll of one question's four candidates. The server is the only thing that knows the price. */
export function useRerollQuestion({ gqlFetch, getToken }: UseRerollQuestionParams) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: RerollInput) => {
      const token = await getToken();
      const { rerollQuestion } = await gqlFetch<{ rerollQuestion: RerollResult }>(REROLL_MUTATION, input, token);
      return rerollQuestion;
    },
    // The coin balance shows in the Vote header and on Profile, so both need the new number.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] })
  });
}
