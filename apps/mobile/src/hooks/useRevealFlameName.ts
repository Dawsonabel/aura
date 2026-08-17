import { useAuth } from '@clerk/expo';
import { useRevealFlameName as useSharedRevealFlameName } from '@aura/api-client';
import { gqlFetch } from '../lib/graphql';

export function useRevealFlameName() {
  const { getToken } = useAuth();
  return useSharedRevealFlameName({ gqlFetch, getToken });
}
