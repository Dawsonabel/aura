import { useAuth } from '@clerk/expo';
import { useRevealFlame as useSharedRevealFlame } from '@aura/api-client';
import { gqlFetch } from '../lib/graphql';

export function useRevealFlame() {
  const { getToken } = useAuth();
  return useSharedRevealFlame({ gqlFetch, getToken });
}
