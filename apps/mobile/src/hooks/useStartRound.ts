import { useAuth } from '@clerk/expo';
import { useStartRound as useSharedStartRound, type PollRound, type RoundPoll, type RoundChoice } from '@aura/api-client';
import { gqlFetch } from '../lib/graphql';

export type { PollRound, RoundPoll, RoundChoice };

export function useStartRound() {
  const { getToken } = useAuth();
  return useSharedStartRound({ gqlFetch, getToken });
}
