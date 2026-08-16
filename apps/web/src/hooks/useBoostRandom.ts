import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/tanstack-react-start';
import { gqlFetch } from '../lib/graphql';

const BOOST_RANDOM_MUTATION = /* GraphQL */ `
  mutation BoostRandom {
    boostRandom {
      coins
      message
    }
  }
`;

type Response = { boostRandom: { coins: number; message: string | null } };

export function useBoostRandom() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const { boostRandom } = await gqlFetch<Response>(BOOST_RANDOM_MUTATION, undefined, token);
      return boostRandom;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] })
  });
}
