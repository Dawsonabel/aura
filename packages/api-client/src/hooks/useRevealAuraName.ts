import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { GqlFetch } from '../client';

const REVEAL_AURA_NAME_MUTATION = /* GraphQL */ `
  mutation RevealAuraName($id: ID!) {
    revealAuraName(id: $id) {
      name
      flipsLeft
    }
  }
`;

type Response = { revealAuraName: { name: string; flipsLeft: number } };

export type UseRevealAuraNameParams = {
  gqlFetch: GqlFetch;
  getToken: () => Promise<string | null | undefined>;
};

export function useRevealAuraName({ gqlFetch, getToken }: UseRevealAuraNameParams) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      const { revealAuraName } = await gqlFetch<Response>(REVEAL_AURA_NAME_MUTATION, { id }, token);
      return revealAuraName;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['auras'] })
  });
}
