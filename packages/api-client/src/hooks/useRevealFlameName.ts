import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { GqlFetch } from '../client';

const REVEAL_FLAME_NAME_MUTATION = /* GraphQL */ `
  mutation RevealFlameName($id: ID!) {
    revealFlameName(id: $id) {
      name
      bonusRevealsLeft
    }
  }
`;

type Response = { revealFlameName: { name: string; bonusRevealsLeft: number } };

export type UseRevealFlameNameParams = {
  gqlFetch: GqlFetch;
  getToken: () => Promise<string | null | undefined>;
};

export function useRevealFlameName({ gqlFetch, getToken }: UseRevealFlameNameParams) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      const { revealFlameName } = await gqlFetch<Response>(REVEAL_FLAME_NAME_MUTATION, { id }, token);
      return revealFlameName;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['flames'] })
  });
}
