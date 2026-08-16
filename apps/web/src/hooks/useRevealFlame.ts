import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/tanstack-react-start';
import { gqlFetch } from '../lib/graphql';

const REVEAL_FLAME_MUTATION = /* GraphQL */ `
  mutation RevealFlame($id: ID!) {
    revealFlame(id: $id) {
      ok
      coins
    }
  }
`;

type Response = { revealFlame: { ok: boolean; coins: number } };

export function useRevealFlame() {
  const { getToken } = useAuth();
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
