import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { GqlFetch } from '../client';

/* The two coin-spending boosts, moved here from apps/web so mobile's Shop uses the same calls rather
   than a second hand-written copy. Both charge server-side; the client never computes a price.

   `random` sprinkles you into extra polls around your school; `crush` puts you into one specific
   person's polls. The costs live in tuning.ts and are read back through the `shop` query. */

const BOOST_RANDOM_MUTATION = /* GraphQL */ `
  mutation BoostRandom {
    boostRandom {
      coins
      message
    }
  }
`;

const BOOST_CRUSH_MUTATION = /* GraphQL */ `
  mutation BoostCrush($targetId: ID!) {
    boostCrush(targetId: $targetId) {
      coins
      message
    }
  }
`;

export type BoostResult = { coins: number; message: string | null };

export type UseBoostParams = {
  gqlFetch: GqlFetch;
  getToken: () => Promise<string | null | undefined>;
};

/* Both invalidate `shop` as well as `me`: the Shop screen renders the balance and gates its own rows on
   whether you can afford them, so spending without refreshing it would leave a row looking affordable
   right after it stopped being. */
function invalidateBalance(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['me'] });
  queryClient.invalidateQueries({ queryKey: ['shop'] });
}

export function useBoostRandom({ gqlFetch, getToken }: UseBoostParams) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const { boostRandom } = await gqlFetch<{ boostRandom: BoostResult }>(BOOST_RANDOM_MUTATION, undefined, token);
      return boostRandom;
    },
    onSuccess: () => invalidateBalance(queryClient)
  });
}

export function useBoostCrush({ gqlFetch, getToken }: UseBoostParams) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (targetId: string) => {
      const token = await getToken();
      const { boostCrush } = await gqlFetch<{ boostCrush: BoostResult }>(BOOST_CRUSH_MUTATION, { targetId }, token);
      return boostCrush;
    },
    onSuccess: () => invalidateBalance(queryClient)
  });
}
