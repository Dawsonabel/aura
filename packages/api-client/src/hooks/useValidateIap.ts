import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { GqlFetch } from '../client';

/* The real purchase path — apps/api/src/schema.ts's `validateIap`, which verifies the StoreKit2
   signed transaction server-side (apps/api/src/iap.ts) before granting anything. This is what
   replaces `legacyInfiniteAura` (useActivateInfiniteAura) as the paywall's actual buy button; that
   mutation is a dev/test shortcut now, gated behind AURA_DEV_TOOLS and refused in production. */
const VALIDATE_IAP_MUTATION = /* GraphQL */ `
  mutation ValidateIap($signedTransaction: String!) {
    validateIap(signedTransaction: $signedTransaction) {
      infiniteAura
      expired
      expires
      environment
      renewed
    }
  }
`;

export type ValidateIapResult = {
  infiniteAura: boolean;
  /** True when the transaction verified but had already lapsed — a receipt for a past period. */
  expired: boolean | null;
  /** ISO string, or null for a non-expiring grant (the lifetime product). */
  expires: string | null;
  /** "Production" | "Sandbox" | "Xcode", as StoreKit reports it. */
  environment: string | null;
  /** False on a transaction id never seen before; true when this id had already been recorded
      (a renewal or a replayed restore) — see the resolver's replay-protection note. */
  renewed: boolean | null;
};

export type UseValidateIapParams = {
  gqlFetch: GqlFetch;
  getToken: () => Promise<string | null | undefined>;
};

export function useValidateIap({ gqlFetch, getToken }: UseValidateIapParams) {
  const queryClient = useQueryClient();

  return useMutation({
    /* `signedTransaction` is the raw JWS string — on iOS, react-native-iap's `purchase.purchaseToken`
       (its own type doc calls this "Unified purchase token (iOS JWS, Android purchaseToken)"). Never
       the parsed payload: the whole point of server verification is that the server parses it after
       checking the signature, not before. */
    mutationFn: async (signedTransaction: string) => {
      const token = await getToken();
      const { validateIap } = await gqlFetch<{ validateIap: ValidateIapResult }>(
        VALIDATE_IAP_MUTATION,
        { signedTransaction },
        token
      );
      return validateIap;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] });
      queryClient.invalidateQueries({ queryKey: ['shop'] });
      // Every aura's `infiniteAura`/`anonymous` mirrors the viewer's own status, recomputed per fetch.
      queryClient.invalidateQueries({ queryKey: ['auras'] });
    }
  });
}
