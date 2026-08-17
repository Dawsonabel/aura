import { useQuery } from '@tanstack/react-query';
import type { GqlFetch } from '../client';

const FLAMES_QUERY = /* GraphQL */ `
  query Flames {
    flames {
      coins
      godMode
      bonusRevealsLeft
      admirerCount
      flames {
        id
        emoji
        q
        color
        gender
        grade
        revealed
        godMode
        unread
        anonymous
        initial
        name
        repeatAdmirer
        pickCount
        ts
        detailHidden
      }
    }
  }
`;

export type Flame = {
  id: string;
  emoji: string;
  q: string;
  color: string;
  gender: string;
  grade: string;
  revealed: boolean;
  godMode: boolean;
  unread: boolean;
  anonymous: boolean;
  initial: string | null;
  name: string | null;
  repeatAdmirer: boolean;
  pickCount: number;
  ts: string;
  /* Gender and grade were withheld because too few people at the school share that cohort — the
     flame should read "someone at your school". Both fields are blanked server-side as well. */
  detailHidden: boolean;
};
export type FlamesResult = {
  flames: Flame[];
  coins: number;
  godMode: boolean;
  bonusRevealsLeft: number;
  /** Distinct people who picked you in the last 7 days — server-derived, see FlamesResult in the API. */
  admirerCount: number;
};

type Response = { flames: FlamesResult };

export type UseFlamesParams = {
  gqlFetch: GqlFetch;
  getToken: () => Promise<string | null | undefined>;
  enabled: boolean;
};

export function useFlames({ gqlFetch, getToken, enabled }: UseFlamesParams) {
  return useQuery({
    queryKey: ['flames'],
    queryFn: async () => {
      const token = await getToken();
      const { flames } = await gqlFetch<Response>(FLAMES_QUERY, undefined, token);
      return flames;
    },
    enabled
  });
}
