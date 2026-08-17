import { useQuery } from '@tanstack/react-query';
import type { GqlFetch } from '../client';

const FLAMES_QUERY = /* GraphQL */ `
  query Flames {
    flames {
      coins
      godMode
      bonusRevealsLeft
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
};
export type FlamesResult = { flames: Flame[]; coins: number; godMode: boolean; bonusRevealsLeft: number };

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
