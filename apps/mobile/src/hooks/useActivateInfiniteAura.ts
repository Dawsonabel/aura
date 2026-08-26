import { useAuth } from '@clerk/expo';
import { useActivateInfiniteAura as useSharedActivateInfiniteAura } from '@aura/api-client';
import { gqlFetch } from '../lib/graphql';

export function useActivateInfiniteAura() {
  const { getToken } = useAuth();
  return useSharedActivateInfiniteAura({ gqlFetch, getToken });
}
