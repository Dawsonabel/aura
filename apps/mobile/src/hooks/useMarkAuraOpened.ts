import { useAuth } from '@clerk/expo';
import { useMarkAuraOpened as useSharedMarkAuraOpened } from '@aura/api-client';
import { gqlFetch } from '../lib/graphql';

export function useMarkAuraOpened() {
  const { getToken } = useAuth();
  return useSharedMarkAuraOpened({ gqlFetch, getToken });
}
