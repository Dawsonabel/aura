import { useAuth } from '@clerk/tanstack-react-start';
import { useMarkAurasRead as useSharedMarkAurasRead } from '@aura/api-client';
import { gqlFetch } from '../lib/graphql';

export function useMarkAurasRead() {
  const { getToken } = useAuth();
  return useSharedMarkAurasRead({ gqlFetch, getToken });
}
