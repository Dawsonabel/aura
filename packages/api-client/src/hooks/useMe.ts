import { useQuery } from '@tanstack/react-query';
import type { GqlFetch } from '../client';
import type { Socials } from '../socials';

const ME_QUERY = /* GraphQL */ `
  query Me {
    me {
      id
      coins
      onboarded
      godMode
      firstName
      lastName
      username
      gender
      grade
      hideTopFlames
      notifyFlames
      notifyRound
      notifyFriendJoined
      quietHours
      pushEnabled
      streak
      roundsTotal
      following
      followerCount
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
  godMode: boolean | null;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  gender: string | null;
  grade: string | null;
  hideTopFlames: boolean | null;
  /* 7A notification preferences. `null` means the user has never set that switch, which is NOT the
     same as off — the server's sender applies its own default (flames/rounds on, friend-joined off),
     so the UI has to render the same fallback rather than showing an unset switch as off. */
  notifyFlames: boolean | null;
  notifyRound: boolean | null;
  notifyFriendJoined: boolean | null;
  quietHours: boolean | null;
  /** Whether any device is registered for push. Tokens themselves never leave the server. */
  pushEnabled: boolean;
  /** Consecutive days with a completed round. Server-derived: reads 0 once a day has been missed. */
  streak: number;
  /** Rounds ever completed. Only used to retire the Vote grid's "hold to peek" teaching chip. */
  roundsTotal: number;
  /** Ids this user follows. One-directional; drives candidate weighting in the round. */
  following: string[] | null;
  /* How many people follow you. Yours alone — the server returns 0 for anyone else, and no screen shows
     it on another person's profile. A count, never a list: who follows you stays private. */
  followerCount: number;
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
