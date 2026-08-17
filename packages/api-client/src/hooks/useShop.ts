import { useQuery } from '@tanstack/react-query';
import type { GqlFetch } from '../client';

/* 15A's Shop. Every number is served, none is written into the client.

   The reason is the same one that put them in tuning.ts: a price on screen that disagrees with the price
   charged is the worst kind of bug in an economy, and the only way to guarantee they agree is to render
   the number the server would charge. It also means retuning is a Cloudflare variable rather than an
   App Store release.

   Dollar prices are the exception and are deliberately absent — StoreKit owns those, localized per
   store. The client pairs each coin amount with the store's own price string. */

const SHOP_QUERY = /* GraphQL */ `
  query Shop {
    shop {
      coins
      clueGradeCost
      clueInitialCost
      freeClueHourUtc
      freeClueReady
      roundPayout
      streakBonus
      inviteBonus
      coinPackSmall
      coinPackMedium
      coinPackLarge
      boostRandomCost
      boostRandomUses
      boostCrushCost
      boostCrushUses
      infiniteAura
      infiniteAuraExpires
    }
  }
`;

export type Shop = {
  coins: number;
  /** The clue ladder's two priced rungs. "Who" is free; the first name is Infinite Aura only. */
  clueGradeCost: number;
  clueInitialCost: number;
  /** UTC hour the daily free clue lands; 24 means it's switched off. */
  freeClueHourUtc: number;
  /** Whether the free tile is claimable right now. Server-derived — see the resolver. */
  freeClueReady: boolean;
  roundPayout: number;
  streakBonus: number;
  /** Advertised in the Shop, not yet credited — invite attribution doesn't exist. */
  inviteBonus: number;
  coinPackSmall: number;
  coinPackMedium: number;
  coinPackLarge: number;
  boostRandomCost: number;
  boostRandomUses: number;
  boostCrushCost: number;
  boostCrushUses: number;
  infiniteAura: boolean;
  /** ISO date the membership renews. Null for a comped unlock with no purchase behind it. */
  infiniteAuraExpires: string | null;
};

export type UseShopParams = {
  gqlFetch: GqlFetch;
  getToken: () => Promise<string | null | undefined>;
  enabled?: boolean;
};

export function useShop({ gqlFetch, getToken, enabled = true }: UseShopParams) {
  return useQuery({
    queryKey: ['shop'],
    queryFn: async () => {
      const token = await getToken();
      const { shop } = await gqlFetch<{ shop: Shop }>(SHOP_QUERY, undefined, token);
      return shop;
    },
    enabled
  });
}
