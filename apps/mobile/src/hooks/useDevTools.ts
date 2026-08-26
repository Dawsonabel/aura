import { useAuth } from '@clerk/expo';
import { useDevTools as useSharedDevTools } from '@aura/api-client';
import { gqlFetch } from '../lib/graphql';

export function useDevTools() {
  const { getToken } = useAuth();
  return useSharedDevTools({ gqlFetch, getToken });
}
