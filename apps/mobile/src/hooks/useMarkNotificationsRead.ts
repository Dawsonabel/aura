import { useAuth } from '@clerk/expo';
import { useMarkNotificationsRead as useSharedMarkNotificationsRead } from '@aura/api-client';
import { gqlFetch } from '../lib/graphql';

export function useMarkNotificationsRead() {
  const { getToken } = useAuth();
  return useSharedMarkNotificationsRead({ gqlFetch, getToken });
}
