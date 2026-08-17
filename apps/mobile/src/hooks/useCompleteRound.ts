import { useAuth } from '@clerk/expo';
import { useCompleteRound as useSharedCompleteRound } from '@aura/api-client';
import { gqlFetch } from '../lib/graphql';

export function useCompleteRound() {
  const { getToken } = useAuth();
  return useSharedCompleteRound({ gqlFetch, getToken });
}
