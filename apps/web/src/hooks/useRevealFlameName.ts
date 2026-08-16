import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/tanstack-react-start';
import { gqlFetch } from '../lib/graphql';

const REVEAL_FLAME_NAME_MUTATION = /* GraphQL */ `
  mutation RevealFlameName($id: ID!) {
    revealFlameName(id: $id) {
      name
      bonusRevealsLeft
    }
  }
`;

type Response = { revealFlameName: { name: string; bonusRevealsLeft: number } };

export function useRevealFlameName() {
  const { getToken } = useAuth();
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
