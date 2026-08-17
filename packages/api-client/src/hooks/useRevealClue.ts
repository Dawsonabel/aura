import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { GqlFetch } from '../client';

/* 16A's clue ladder — one mutation for both paid tiles.

   The server decides how it's paid for (membership, then the free daily tile, then coins) and reports
   which route it used, so the client never has to guess and can't charge a tile the server gave away.
   It's idempotent server-side too: tapping an already-open tile returns the current balance untouched. */

const REVEAL_CLUE_MUTATION = /* GraphQL */ `
  mutation RevealClue($id: ID!, $clue: String!) {
    revealClue(id: $id, clue: $clue) {
      ok
      coins
      usedFreeClue
    }
  }
`;

export type ClueName = 'grade' | 'initial';
export type RevealClueInput = { id: string; clue: ClueName };
export type RevealClueResult = { ok: boolean; coins: number; usedFreeClue: boolean };

export type UseRevealClueParams = {
  gqlFetch: GqlFetch;
  getToken: () => Promise<string | null | undefined>;
};

export function useRevealClue({ gqlFetch, getToken }: UseRevealClueParams) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RevealClueInput) => {
      const token = await getToken();
      const { revealClue } = await gqlFetch<{ revealClue: RevealClueResult }>(REVEAL_CLUE_MUTATION, input, token);
      return revealClue;
    },
    /* `flames` carries the tile states and `shop` carries both the balance and whether the free tile is
       still going — spending one without refreshing the other would leave the next tile advertising
       "FREE TODAY" after it had been used. */
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flames'] });
      queryClient.invalidateQueries({ queryKey: ['shop'] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
    }
  });
}
