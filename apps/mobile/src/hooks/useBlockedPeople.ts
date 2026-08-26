import { useAuth } from '@clerk/expo';
import { useBlockedPeople as useSharedBlockedPeople, type BlockedPerson } from '@aura/api-client';
import { gqlFetch } from '../lib/graphql';

export type { BlockedPerson };

export function useBlockedPeople() {
  const { getToken, isSignedIn } = useAuth();
  return useSharedBlockedPeople({ gqlFetch, getToken, enabled: isSignedIn === true });
}
