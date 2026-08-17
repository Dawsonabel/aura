import { useAuth } from '@clerk/expo';
import { useNotifications as useSharedNotifications, type Notification } from '@aura/api-client';
import { gqlFetch } from '../lib/graphql';

export type { Notification };

export function useNotifications() {
  const { getToken, isSignedIn } = useAuth();
  return useSharedNotifications({ gqlFetch, getToken, enabled: isSignedIn === true });
}
