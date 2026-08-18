import { useAuth } from '@clerk/expo';
import { useRevealClue as useSharedRevealClue, type ClueName } from '@aura/api-client';
import { gqlFetch } from '../lib/graphql';

export type { ClueName };

export function useRevealClue() {
  const { getToken } = useAuth();
  return useSharedRevealClue({ gqlFetch, getToken });
}
