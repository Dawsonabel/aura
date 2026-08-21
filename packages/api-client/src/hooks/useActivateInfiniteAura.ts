import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { GqlFetch } from '../client';

const ACTIVATE_GOD_MODE_MUTATION = /* GraphQL */ `
  mutation ActivateInfiniteAura($on: Boolean) {
    legacyInfiniteAura(on: $on)
  }
`;

export type UseActivateInfiniteAuraParams = {
  gqlFetch: GqlFetch;
  getToken: () => Promise<string | null | undefined>;
};

/* Demo shortcut, not real IAP — real StoreKit2 validation (validateIap, already built server-side in
   apps/api) is Phase 5 (Shop + Infinite Aura) scope. Matches the pre-existing apps/web behavior this was
   ported from.

   Takes a direction: `mutate(false)` turns membership back off, which is what makes the free
   experience reachable again after granting yourself Infinite Aura. Defaults to on so the paywall's
   existing `mutate(undefined)` call sites keep meaning what they did. */
export function useActivateInfiniteAura({ gqlFetch, getToken }: UseActivateInfiniteAuraParams) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (on?: boolean) => {
      const token = await getToken();
      const { legacyInfiniteAura } = await gqlFetch<{ legacyInfiniteAura: boolean }>(
        ACTIVATE_GOD_MODE_MUTATION,
        { on: on ?? true },
        token
      );
      return legacyInfiniteAura;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] });
      // Every aura's `infiniteAura` field mirrors the viewer's own status, recomputed per fetch.
      queryClient.invalidateQueries({ queryKey: ['auras'] });
    }
  });
}
