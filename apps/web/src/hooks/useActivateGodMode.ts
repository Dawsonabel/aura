import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/tanstack-react-start';
import { gqlFetch } from '../lib/graphql';

const ACTIVATE_GOD_MODE_MUTATION = /* GraphQL */ `
  mutation ActivateGodMode {
    legacyGodMode
  }
`;

/* Web demo shortcut — real StoreKit2 IAP validation (validateIap, already built server-side in
   apps/api) is its own later phase once there's a native wrapper to test it against. Matches the
   old app's own "Web demo: instant unlock (no real payment on the web build)" comment. */
export function useActivateGodMode() {
  const { getToken } = useAuth();
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
