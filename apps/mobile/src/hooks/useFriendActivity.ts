import { useAuth } from '@clerk/expo';
import {
  useFriendActivity as useSharedFriendActivity,
  type FriendActivity,
  type FriendActivityEvent,
  type FriendMilestone
} from '@aura/api-client';
import { gqlFetch } from '../lib/graphql';

export type { FriendActivity, FriendActivityEvent, FriendMilestone };

export function useFriendActivity() {
  const { getToken, isSignedIn } = useAuth();
  return useSharedFriendActivity({ gqlFetch, getToken, enabled: isSignedIn === true });
}
