import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { GqlFetch } from '../client';

const MARK_AURA_OPENED_MUTATION = /* GraphQL */ `
  mutation MarkAuraOpened($id: ID!) {
    markAuraOpened(id: $id)
  }
`;

export type UseMarkAuraOpenedParams = {
  gqlFetch: GqlFetch;
  getToken: () => Promise<string | null | undefined>;
};

/* Records that one card was opened at full size.

   Fire-and-forget by design. It costs nothing, it's idempotent, and the screen it's called from does
   not wait on it — the card renders from cache the moment you tap. A failure here means one card
   looks untouched next time you're in the grid, which is worth exactly zero interruption.

   The `auras` invalidation is what makes the grid dim it. Deliberately not optimistic: the whole
   point is that the flag survives the trip to the server, so showing it before the write lands would
   be showing the one thing this feature is meant to prove. */
export function useMarkAuraOpened({ gqlFetch, getToken }: UseMarkAuraOpenedParams) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      const { markAuraOpened } = await gqlFetch<{ markAuraOpened: boolean }>(
        MARK_AURA_OPENED_MUTATION,
        { id },
        token
      );
      return markAuraOpened;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['auras'] })
  });
}
