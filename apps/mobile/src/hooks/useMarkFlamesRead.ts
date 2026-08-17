import { useAuth } from '@clerk/expo';
import { useMarkFlamesRead as useSharedMarkFlamesRead } from '@aura/api-client';
import { gqlFetch } from '../lib/graphql';

export function useMarkFlamesRead() {
  const { getToken } = useAuth();
  return useSharedMarkFlamesRead({ gqlFetch, getToken });
}
