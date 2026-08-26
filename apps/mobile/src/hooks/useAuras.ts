import { useAuth } from '@clerk/expo';
import { useAuras as useSharedAuras, type Aura, type AurasResult } from '@aura/api-client';
import { gqlFetch } from '../lib/graphql';

export type { Aura, AurasResult };

export function useAuras() {
  const { getToken, isSignedIn } = useAuth();
  return useSharedAuras({ gqlFetch, getToken, enabled: isSignedIn === true });
}
