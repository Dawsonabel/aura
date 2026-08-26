import { useAuth } from '@clerk/expo';
import { useBlockUser as useSharedBlockUser } from '@aura/api-client';
import { gqlFetch } from '../lib/graphql';

export function useBlockUser() {
  const { getToken } = useAuth();
  return useSharedBlockUser({ gqlFetch, getToken });
}
