import { useQuery } from '@tanstack/react-query';
import type { GqlFetch } from '../client';

/* Your friends' picks — the other half of the Activity feed.

   Your *own* picks aren't here: `useAuras` already carries them, gender and timestamp included, so
   building "A girl gave you aura" client-side from the query the tab has open anyway costs nothing.
   This hook exists only for the rows that genuinely need the server, which is the friend graph.

   A friend event now carries its prompt (`label`/`emoji`), the same pair your own card shows. It used
   to be withheld on purpose; see FriendActivityEvent in apps/api/src/auras.ts for both sides of that
   and why it was reversed. The voter is still anonymous either way. */

/* Three fields, one document. All three feed the Activity segment and none is useful without the
   others, so asking for them together is one round trip instead of three racing requests that make the
   feed assemble itself in stages on screen. */
const FRIEND_ACTIVITY_QUERY = /* GraphQL */ `
  query FriendActivity {
    friendActivity {
      id
      ts
      friendId
      friendName
      gender
      label
      emoji
    }
    friendMilestones {
      id
      ts
      friendId
      friendName
      kind
      count
      label
      emoji
    }
    schoolPulse {
      today
      yesterday
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
  /** The prompt the vote was cast on, and its emoji — as shown on the target's own card. */
  label: string;
  emoji: string;
};

/** Picks across your whole school: the last 24 hours, and the 24 hours before that. */
export type SchoolPulse = { today: number; yesterday: number };

export type FriendMilestone = {
  id: string;
  ts: string;
  friendId: string;
  friendName: string;
  /** "streak" | "superlative" */
  kind: string;
  /** Days for a streak, wins for a superlative. */
  count: number;
  /** The superlative's prompt and emoji. Empty on a streak. */
  label: string;
  emoji: string;
};

/** Everything the Activity segment needs beyond your own auras and notifications. */
export type FriendActivity = {
  events: FriendActivityEvent[];
  milestones: FriendMilestone[];
  /** How busy your school has been: last 24h, and the 24h before it. */
  schoolPulse: SchoolPulse;
};

type Response = {
  friendActivity: FriendActivityEvent[];
  friendMilestones: FriendMilestone[];
  schoolPulse: SchoolPulse;
};

export type UseFriendActivityParams = {
  gqlFetch: GqlFetch;
  getToken: () => Promise<string | null | undefined>;
  enabled: boolean;
};

export function useFriendActivity({ gqlFetch, getToken, enabled }: UseFriendActivityParams) {
  return useQuery({
    queryKey: ['friendActivity'],
    queryFn: async (): Promise<FriendActivity> => {
      const token = await getToken();
      const data = await gqlFetch<Response>(FRIEND_ACTIVITY_QUERY, undefined, token);
      return {
        events: data.friendActivity,
        milestones: data.friendMilestones,
        schoolPulse: data.schoolPulse
      };
    },
    enabled
  });
}
