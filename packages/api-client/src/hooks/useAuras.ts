import { useQuery } from '@tanstack/react-query';
import type { GqlFetch } from '../client';

const AURAS_QUERY = /* GraphQL */ `
  query Auras {
    auras {
      coins
      infiniteAura
      admirerCount
      lifetimeAuras
      flipsLeft
      flipsPerDay
      auras {
        id
        emoji
        q
        color
        gender
        grade
        infiniteAura
        unread
        anonymous
        name
        repeatAdmirer
        newestFromSender
        pickCount
        ts
        opened
        detailHidden
      }
    }
  }
`;

export type Aura = {
  id: string;
  emoji: string;
  q: string;
  color: string;
  /* A card has two states and no rungs in between. Face down it gives the poll and the gender; flipped
     it gives the name and grade as well. The clue ladder that sold the grade and first initial as
     separate scratch tiles is gone, and so are `revealed`, `gradeRevealed` and `initial`. */
  gender: string;
  /* Free on a face-down card, beside the gender — the flip buys the *name* and nothing else. Empty
     only when the anonymity floor withholds it (see `detailHidden`), which is off by default.

     This said "empty until flipped, it arrives with the name" long after that stopped being true, and
     the Infinite Aura paywall was written from it — advertising a paid benefit the app gives away. */
  grade: string;
  infiniteAura: boolean;
  unread: boolean;
  anonymous: boolean;
  /** Null until flipped. */
  name: string | null;
  repeatAdmirer: boolean;
  /** The most recent card from its sender — the feed's "6 times" line shows on this one only. */
  newestFromSender: boolean;
  pickCount: number;
  ts: string;
  /* Whether you've already opened this card at full size — NOT whether it's flipped.

     The two come apart exactly where it matters: a protected sender's card and one you ran out of
     flips on can both be opened without ever turning over, and without this they look identical to
     cards you've never touched. See markAuraOpened. */
  opened: boolean;
  /* The gender was withheld because too few people at the school share this sender's cohort — the
     card should read "Someone". Blanked server-side as well. Off by default. */
  detailHidden: boolean;
};
export type AurasResult = {
  auras: Aura[];
  coins: number;
  infiniteAura: boolean;
  /** Distinct people who picked you in the last 7 days — server-derived, see AurasResult in the API. */
  admirerCount: number;
  /** Every aura ever received. `auras` above is the 30-day window; this one has no cutoff. */
  lifetimeAuras: number;
  /* Name reveals left today, and the daily allowance. Both 0 / the tuned value for a non-member:
     `flipsLeft` is 0 for them because the allowance is what Infinite Aura buys. Counted per card, so
     five picks from one classmate are five flips. */
  flipsLeft: number;
  flipsPerDay: number;
};

type Response = { auras: AurasResult };

export type UseAurasParams = {
  gqlFetch: GqlFetch;
  getToken: () => Promise<string | null | undefined>;
  enabled: boolean;
};

export function useAuras({ gqlFetch, getToken, enabled }: UseAurasParams) {
  return useQuery({
    queryKey: ['auras'],
    queryFn: async () => {
      const token = await getToken();
      const { auras } = await gqlFetch<Response>(AURAS_QUERY, undefined, token);
      return auras;
    },
    enabled
  });
}
