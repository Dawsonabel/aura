import { useAuth } from '@clerk/expo';
import { useUnblockUser as useSharedUnblockUser } from '@aura/api-client';
import { gqlFetch } from '../lib/graphql';

export function useUnblockUser() {
  const { getToken } = useAuth();
  return useSharedUnblockUser({ gqlFetch, getToken });
}
