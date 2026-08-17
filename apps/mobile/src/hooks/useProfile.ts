import { useAuth } from '@clerk/expo';
import {
  useCheckUsername as useSharedCheckUsername,
  useMySuperlatives as useSharedMySuperlatives,
  usePublicProfile as useSharedPublicProfile,
  type PublicProfile,
  type Superlative
} from '@aura/api-client';
import { gqlFetch } from '../lib/graphql';

export type { PublicProfile, Superlative };

export function useMySuperlatives() {
  const { getToken, isSignedIn } = useAuth();
  return useSharedMySuperlatives({ gqlFetch, getToken, enabled: isSignedIn === true });
}

export function usePublicProfile(userId: string) {
  const { getToken, isSignedIn } = useAuth();
  return useSharedPublicProfile({ gqlFetch, getToken, userId, enabled: isSignedIn === true });
}

export function useCheckUsername() {
  const { getToken } = useAuth();
  return useSharedCheckUsername({ gqlFetch, getToken });
}
