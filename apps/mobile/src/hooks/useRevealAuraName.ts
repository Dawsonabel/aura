import { useAuth } from '@clerk/expo';
import { useRevealAuraName as useSharedRevealAuraName } from '@aura/api-client';
import { gqlFetch } from '../lib/graphql';

export function useRevealAuraName() {
  const { getToken } = useAuth();
  return useSharedRevealAuraName({ gqlFetch, getToken });
}
