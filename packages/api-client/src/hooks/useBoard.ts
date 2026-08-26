import { useQuery } from '@tanstack/react-query';
import type { GqlFetch } from '../client';

const BOARD_QUERY = /* GraphQL */ `
  query Board($scope: String) {
    board(scope: $scope) {
      scope
      resetsAt
      aurasToTopTen
      memberCount
      unlockThreshold
      unlocked
      entries {
        rank
        userId
        name
        grade
        auras
        blocked
      }
      me {
        rank
        userId
        name
        grade
        auras
        blocked
      }
    }
  }
`;

/** "overall" = this week · "grade" = this week, my grade · "trending" = last 24h ("Hottest"). */
export type BoardScope = 'overall' | 'grade' | 'trending';

export type BoardEntry = {
  rank: number;
  userId: string;
  /** "Blocked" when the caller blocked this person — rank and auras stay truthful. */
  name: string;
  grade: string | null;
  auras: number;
  blocked: boolean;
};

export type Board = {
  scope: BoardScope;
  /** Next UTC Sunday, ISO — the countdown pill derives "2d left" from this. */
  resetsAt: string;
  aurasToTopTen: number | null;
  entries: BoardEntry[];
  me: BoardEntry | null;
  /** People at the school so far, and how many it takes to unlock the board. */
  memberCount: number;
  unlockThreshold: number;
  /** While false, `entries` is empty by design — the standings are withheld, not client-hidden. */
  unlocked: boolean;
};

type Response = { board: Board };

export type UseBoardParams = {
  gqlFetch: GqlFetch;
  getToken: () => Promise<string | null | undefined>;
  scope: BoardScope;
  enabled?: boolean;
};

export function useBoard({ gqlFetch, getToken, scope, enabled = true }: UseBoardParams) {
  return useQuery({
    // Scope is part of the key so switching chips swaps in cached data instantly instead of
    // re-fetching the same board on every tap.
    queryKey: ['board', scope],
    queryFn: async () => {
      const token = await getToken();
      const { board } = await gqlFetch<Response>(BOARD_QUERY, { scope }, token);
      return board;
    },
    enabled
  });
}
