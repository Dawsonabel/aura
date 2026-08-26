import { useAuth } from '@clerk/expo';
import { useDeleteMe as useSharedDeleteMe } from '@aura/api-client';
import { gqlFetch } from '../lib/graphql';

export function useDeleteMe() {
  const { getToken } = useAuth();
  return useSharedDeleteMe({ gqlFetch, getToken });
}
