import { useAuth } from '@clerk/expo';
import { useFlames as useSharedFlames, type Flame, type FlamesResult } from '@aura/api-client';
import { gqlFetch } from '../lib/graphql';

export type { Flame, FlamesResult };

export function useFlames() {
  const { getToken, isSignedIn } = useAuth();
  return useSharedFlames({ gqlFetch, getToken, enabled: isSignedIn === true });
}
