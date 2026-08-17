import { useAuth } from '@clerk/expo';
import { useVote as useSharedVote, type VoteInput } from '@aura/api-client';
import { gqlFetch } from '../lib/graphql';

export type { VoteInput };

export function useVote() {
  const { getToken } = useAuth();
  return useSharedVote({ gqlFetch, getToken });
}
