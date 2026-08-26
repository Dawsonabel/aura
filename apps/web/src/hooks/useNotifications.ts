import { useAuth } from '@clerk/tanstack-react-start';
import { useNotifications as useSharedNotifications, type Notification } from '@aura/api-client';
import { gqlFetch } from '../lib/graphql';

export type { Notification };

export function useNotifications() {
  const { getToken, isSignedIn } = useAuth();
  return useSharedNotifications({ gqlFetch, getToken, enabled: isSignedIn === true });
}
