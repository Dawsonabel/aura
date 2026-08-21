import { useAuth } from '@clerk/expo';
import {
  useAcceptFriendRequest as useSharedAccept,
  useCancelFriendRequest as useSharedCancel,
  useDenyFriendRequest as useSharedDeny,
  useFriendRequests as useSharedFriendRequests,
  useRemoveFriend as useSharedRemove,
  useSendFriendRequest as useSharedSend,
  type FriendRequester
} from '@aura/api-client';
import { gqlFetch } from '../lib/graphql';

export type { FriendRequester };

/* App-side wrappers over the shared friend hooks — same pattern as every other hook here: the shared
   package owns the queries, this file supplies Expo's base URL and the Clerk token. */

export function useSendFriendRequest() {
  const { getToken } = useAuth();
  return useSharedSend({ gqlFetch, getToken });
}
export function useCancelFriendRequest() {
  const { getToken } = useAuth();
  return useSharedCancel({ gqlFetch, getToken });
}
export function useAcceptFriendRequest() {
  const { getToken } = useAuth();
  return useSharedAccept({ gqlFetch, getToken });
}
export function useDenyFriendRequest() {
  const { getToken } = useAuth();
  return useSharedDeny({ gqlFetch, getToken });
}
export function useRemoveFriend() {
  const { getToken } = useAuth();
  return useSharedRemove({ gqlFetch, getToken });
}
export function useFriendRequests() {
  const { getToken, isSignedIn } = useAuth();
  return useSharedFriendRequests({ gqlFetch, getToken }, isSignedIn === true);
}
