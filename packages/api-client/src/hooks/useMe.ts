import { useQuery } from '@tanstack/react-query';
import type { GqlFetch } from '../client';
import type { Socials } from '../socials';

const ME_QUERY = /* GraphQL */ `
  query Me {
    me {
      id
      coins
      onboarded
      infiniteAura
      firstName
      lastName
      username
      gender
      grade
      hideTopAuras
      notifyAuras
      notifyRound
      notifyFriendJoined
      quietHours
      pushEnabled
      streak
      roundsTotal
      friends
      socials {
        instagram
        snapchat
        tiktok
        spotify
      }
      schoolId
      school {
        id
        name
      }
    }
  }
`;

export type Me = {
  id: string;
  coins: number;
  onboarded: boolean;
  infiniteAura: boolean | null;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  gender: string | null;
  grade: string | null;
  hideTopAuras: boolean | null;
  /* 7A notification preferences. `null` means the user has never set that switch, which is NOT the
     same as off — the server's sender applies its own default (auras/rounds on, friend-joined off),
     so the UI has to render the same fallback rather than showing an unset switch as off. */
  notifyAuras: boolean | null;
  notifyRound: boolean | null;
  notifyFriendJoined: boolean | null;
  quietHours: boolean | null;
  /** Whether any device is registered for push. Tokens themselves never leave the server. */
  pushEnabled: boolean;
  /** Consecutive days with a completed round. Server-derived: reads 0 once a day has been missed. */
  streak: number;
  /** Rounds ever completed. Only used to retire the Vote grid's "hold to peek" teaching chip. */
  roundsTotal: number;
  /* Your friends. Mutual and approved, and drives candidate weighting in the round.

     Yours alone — the server returns an empty list for anyone else, and there is no count field for
     another person either. Count this if you need your own number. */
  friends: string[] | null;
  /** Linktree-style handles shown on the Me tab. Always an object; each platform may be null. */
  socials: Socials;
  schoolId: string | null;
  school: { id: string; name: string } | null;
};

type MeResult = { me: Me };

export type UseMeParams = {
  gqlFetch: GqlFetch;
  getToken: () => Promise<string | null | undefined>;
  enabled: boolean;
};

export function useMe({ gqlFetch, getToken, enabled }: UseMeParams) {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const token = await getToken();
      const { me } = await gqlFetch<MeResult>(ME_QUERY, undefined, token);
      return me;
    },
    enabled
  });
}
