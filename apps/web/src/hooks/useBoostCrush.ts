import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/tanstack-react-start';
import { gqlFetch } from '../lib/graphql';

const BOOST_CRUSH_MUTATION = /* GraphQL */ `
  mutation BoostCrush($targetId: ID!) {
    boostCrush(targetId: $targetId) {
      coins
      message
    }
  }
`;

type Response = { boostCrush: { coins: number; message: string | null } };

export function useBoostCrush() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (targetId: string) => {
      const token = await getToken();
      const { boostCrush } = await gqlFetch<Response>(BOOST_CRUSH_MUTATION, { targetId }, token);
      return boostCrush;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] })
  });
}
