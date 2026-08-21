import { useAuth } from '@clerk/expo';
import { useFriendActivity as useSharedFriendActivity, type FriendActivityEvent } from '@aura/api-client';
import { gqlFetch } from '../lib/graphql';

export type { FriendActivityEvent };

export function useFriendActivity() {
  const { getToken, isSignedIn } = useAuth();
  return useSharedFriendActivity({ gqlFetch, getToken, enabled: isSignedIn === true });
}
