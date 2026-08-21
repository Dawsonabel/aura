import { useQuery } from '@tanstack/react-query';
import type { GqlFetch } from '../client';

/* Your friends' picks — the other half of the Activity feed.

   Your *own* picks aren't here: `useAuras` already carries them, gender and timestamp included, so
   building "A girl gave you aura" client-side from the query the tab has open anyway costs nothing.
   This hook exists only for the rows that genuinely need the server, which is the friend graph.

   Note what the document can't ask for. There is no superlative field on FriendActivityEvent — see
   friendActivityFor in apps/api/src/auras.ts for why a friend's prompt stays with the friend. */

const FRIEND_ACTIVITY_QUERY = /* GraphQL */ `
  query FriendActivity {
    friendActivity {
      id
      ts
      friendId
      friendName
      gender
    }
  }
`;

export type FriendActivityEvent = {
  id: string;
  ts: string;
  friendId: string;
  friendName: string;
  /** The voter's gender, or "private" when it was withheld. */
  gender: string;
};

type Response = { friendActivity: FriendActivityEvent[] };

export type UseFriendActivityParams = {
  gqlFetch: GqlFetch;
  getToken: () => Promise<string | null | undefined>;
  enabled: boolean;
};

export function useFriendActivity({ gqlFetch, getToken, enabled }: UseFriendActivityParams) {
  return useQuery({
    queryKey: ['friendActivity'],
    queryFn: async () => {
      const token = await getToken();
      const { friendActivity } = await gqlFetch<Response>(FRIEND_ACTIVITY_QUERY, undefined, token);
      return friendActivity;
    },
    enabled
  });
}
