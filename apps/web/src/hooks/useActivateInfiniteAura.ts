import { useAuth } from '@clerk/tanstack-react-start';
import { useActivateInfiniteAura as useSharedActivateInfiniteAura } from '@aura/api-client';
import { gqlFetch } from '../lib/graphql';

export function useActivateInfiniteAura() {
  const { getToken } = useAuth();
  return useSharedActivateInfiniteAura({ gqlFetch, getToken });
}
