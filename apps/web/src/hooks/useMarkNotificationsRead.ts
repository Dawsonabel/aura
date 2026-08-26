import { useAuth } from '@clerk/tanstack-react-start';
import { useMarkNotificationsRead as useSharedMarkNotificationsRead } from '@aura/api-client';
import { gqlFetch } from '../lib/graphql';

export function useMarkNotificationsRead() {
  const { getToken } = useAuth();
  return useSharedMarkNotificationsRead({ gqlFetch, getToken });
}
