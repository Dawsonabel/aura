import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { GqlFetch } from '../client';

const REVEAL_FLAME_MUTATION = /* GraphQL */ `
  mutation RevealFlame($id: ID!) {
    revealFlame(id: $id) {
      ok
      coins
    }
  }
`;

type Response = { revealFlame: { ok: boolean; coins: number } };

export type UseRevealFlameParams = {
  gqlFetch: GqlFetch;
  getToken: () => Promise<string | null | undefined>;
};

export function useRevealFlame({ gqlFetch, getToken }: UseRevealFlameParams) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      const { revealFlame } = await gqlFetch<Response>(REVEAL_FLAME_MUTATION, { id }, token);
      return revealFlame;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flames'] });
      queryClient.invalidateQueries({ queryKey: ['me'] }); // coins changed
    }
  });
}
