import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { GqlFetch } from '../client';

const ACTIVATE_GOD_MODE_MUTATION = /* GraphQL */ `
  mutation ActivateGodMode {
    legacyGodMode
  }
`;

export type UseActivateGodModeParams = {
  gqlFetch: GqlFetch;
  getToken: () => Promise<string | null | undefined>;
};

/* Demo shortcut, not real IAP — real StoreKit2 validation (validateIap, already built
   server-side in apps/api) is Phase 5 (Shop + God Mode) scope. Matches the pre-existing
   apps/web behavior this was ported from. */
export function useActivateGodMode({ gqlFetch, getToken }: UseActivateGodModeParams) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const { legacyGodMode } = await gqlFetch<{ legacyGodMode: boolean }>(ACTIVATE_GOD_MODE_MUTATION, undefined, token);
      return legacyGodMode;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] });
      // Every flame's `godMode` field mirrors the viewer's own status, recomputed per fetch.
      queryClient.invalidateQueries({ queryKey: ['flames'] });
    }
  });
}
