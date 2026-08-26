import { useAuth } from '@clerk/expo';
import { useBoard as useSharedBoard, type Board, type BoardEntry, type BoardScope } from '@aura/api-client';
import { gqlFetch } from '../lib/graphql';

export type { Board, BoardEntry, BoardScope };

export function useBoard(scope: BoardScope) {
  const { getToken, isSignedIn } = useAuth();
  return useSharedBoard({ gqlFetch, getToken, scope, enabled: isSignedIn === true });
}
