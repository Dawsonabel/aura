import { useAuth } from '@clerk/expo';
import { useBoostRandom as useSharedBoostRandom, useBoostCrush as useSharedBoostCrush } from '@aura/api-client';
import { gqlFetch } from '../lib/graphql';

export function useBoostRandom() {
  const { getToken } = useAuth();
  return useSharedBoostRandom({ gqlFetch, getToken });
}

export function useBoostCrush() {
  const { getToken } = useAuth();
  return useSharedBoostCrush({ gqlFetch, getToken });
}
