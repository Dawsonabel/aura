/* The two StoreKit product ids Infinite Aura is sold under.

   These are one of CLAUDE.md's three deliberate naming exceptions: `aura.godmode.weekly` and
   `aura.godmode.lifetime` are registered with Apple and attached to real purchases, so they keep
   saying "godmode" even though the product is Infinite Aura everywhere else in the app. Renaming
   them here doesn't rename them in App Store Connect — it just stops matching incoming receipts.

   Must match apps/api/src/schema.ts's DEFAULT_INFINITE_AURA_PRODUCTS (and, if it's ever set, the
   INFINITE_AURA_PRODUCT_IDS env var) exactly. Nothing enforces that at build time — client and
   server are two separate TypeScript programs with no shared import across the Worker boundary — so
   a drift here is a silent one: the purchase would succeed, react-native-iap would deliver a real
   JWS, and `validateIap` would reject it with "Unknown product" because the id it decoded from the
   transaction isn't in the server's list. If either side's id ever changes, change both together.

   `type` is what tells `requestPurchase` (and StoreKit) which flow to run — a subscription and a
   non-consumable are genuinely different purchase sheets, not a display detail. */
export type InfiniteAuraTier = {
  id: string;
  type: 'subs' | 'in-app';
  /** Matches the card in infinite.tsx that sells it — for looking a tier up by what the user tapped. */
  key: 'weekly' | 'lifetime';
};

export const INFINITE_AURA_TIERS: InfiniteAuraTier[] = [
  { id: 'aura.godmode.weekly', type: 'subs', key: 'weekly' },
  { id: 'aura.godmode.lifetime', type: 'in-app', key: 'lifetime' }
];

export const INFINITE_AURA_PRODUCT_IDS = INFINITE_AURA_TIERS.map(t => t.id);

export function tierFor(productId: string): InfiniteAuraTier | undefined {
  return INFINITE_AURA_TIERS.find(t => t.id === productId);
}
