import { useAuth } from '@clerk/tanstack-react-start';
import { useAuraRound as useSharedAuraRound } from '@aura/api-client';
import { gqlFetch } from '../lib/graphql';

export function useAuraRound() {
  const { getToken, isSignedIn } = useAuth();
  return useSharedAuraRound({ gqlFetch, getToken, enabled: isSignedIn === true });
}
