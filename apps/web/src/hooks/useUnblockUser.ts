import { useAuth } from '@clerk/tanstack-react-start';
import { useUnblockUser as useSharedUnblockUser } from '@aura/api-client';
import { gqlFetch } from '../lib/graphql';

export function useUnblockUser() {
  const { getToken } = useAuth();
  return useSharedUnblockUser({ gqlFetch, getToken });
}
