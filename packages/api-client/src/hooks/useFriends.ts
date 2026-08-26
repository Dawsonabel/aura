import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GqlFetch } from '../client';

/* The friendship lifecycle, one hook per step.

   Replaces useFollow/useUnfollow/useFollowGrade. Following was one-directional and needed no approval,
   so it had exactly two states and two mutations; a friendship has a pending middle and two people who
   both have to act, which is why there are five.

   Every mutation returns the caller's own friend list, so nothing here has to guess at the new state —
   but they all invalidate anyway, because a request changes what the *other* person's row says about
   you (`friendState`) and that's what the People screen draws its buttons from. */

const MUTATIONS = {
  send: /* GraphQL */ `mutation Send($userId: ID!) { sendFriendRequest(userId: $userId) }`,
  cancel: /* GraphQL */ `mutation Cancel($userId: ID!) { cancelFriendRequest(userId: $userId) }`,
  accept: /* GraphQL */ `mutation Accept($userId: ID!) { acceptFriendRequest(userId: $userId) }`,
  deny: /* GraphQL */ `mutation Deny($userId: ID!) { denyFriendRequest(userId: $userId) }`,
  remove: /* GraphQL */ `mutation Remove($userId: ID!) { removeFriend(userId: $userId) }`
} as const;

const FRIEND_REQUESTS_QUERY = /* GraphQL */ `
  query FriendRequests {
    friendRequests {
      id
      firstName
      lastName
      username
      grade
      photo
    }
  }
`;

export type FriendRequester = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  grade: string | null;
  photo: string | null;
};

export type UseFriendsParams = {
  gqlFetch: GqlFetch;
  getToken: () => Promise<string | null | undefined>;
};

/* Where you stand with one person, from your side. Mirrors the server's `friendState` — the only thing
   the friend graph exposes about somebody else, and it's about the pair rather than about them. */
export type FriendState = 'self' | 'friends' | 'sent' | 'received' | 'none';

function invalidateFriendState(queryClient: ReturnType<typeof useQueryClient>) {
  /* `me` carries your own friend list; `schoolmates` and `suggestions` carry everyone's friendState;
     `friendRequests` is the incoming queue. The round goes too — candidate weighting changes the
     moment a friendship does, so a stale round would keep showing the old mix. And `friendActivity`
     is the Activity feed's friend rows, which are literally a projection of this list: accepting
     someone should put their picks in your feed without waiting for a refetch on focus. */
  for (const key of ['me', 'friends', 'friendRequests', 'schoolmates', 'suggestions', 'pollRound', 'friendActivity']) {
    queryClient.invalidateQueries({ queryKey: [key] });
  }
}

function friendMutation(kind: keyof typeof MUTATIONS, { gqlFetch, getToken }: UseFriendsParams) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const token = await getToken();
      const data = await gqlFetch<Record<string, string[]>>(MUTATIONS[kind], { userId }, token);
      return Object.values(data)[0] ?? [];
    },
    onSuccess: () => invalidateFriendState(queryClient)
  });
}

/** Ask someone. If they've already asked you, the server accepts theirs instead of crossing requests. */
export const useSendFriendRequest = (p: UseFriendsParams) => friendMutation('send', p);
/** Withdraw your own request. Clears both sides. */
export const useCancelFriendRequest = (p: UseFriendsParams) => friendMutation('cancel', p);
export const useAcceptFriendRequest = (p: UseFriendsParams) => friendMutation('accept', p);
/** Silent by design — the sender is told nothing, they just stop being pending. */
export const useDenyFriendRequest = (p: UseFriendsParams) => friendMutation('deny', p);
/** Mutual: there is no version where one side keeps the edge. */
export const useRemoveFriend = (p: UseFriendsParams) => friendMutation('remove', p);

/** People waiting on your answer. Incoming only — your outgoing ones show as `friendState: 'sent'`. */
export function useFriendRequests({ gqlFetch, getToken }: UseFriendsParams, enabled = true) {
  return useQuery({
    queryKey: ['friendRequests'],
    enabled,
    queryFn: async () => {
      const token = await getToken();
      const { friendRequests } = await gqlFetch<{ friendRequests: FriendRequester[] }>(
        FRIEND_REQUESTS_QUERY,
        undefined,
        token
      );
      return friendRequests;
    }
  });
}
