import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { GqlFetch } from '../client';

const BLOCK_MUTATION = /* GraphQL */ `
  mutation Block($userId: ID!) {
    block(userId: $userId)
  }
`;

export type UseBlockUserParams = {
  gqlFetch: GqlFetch;
  getToken: () => Promise<string | null | undefined>;
};

export function useBlockUser({ gqlFetch, getToken }: UseBlockUserParams) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      const token = await getToken();
      const { block } = await gqlFetch<{ block: string[] }>(BLOCK_MUTATION, { userId }, token);
      return block;
    },
    onSuccess: () => {
      // Blocking also drops the friendship server-side (see schema.ts's block resolver), so both
      // lists need refreshing, not just ['blocked']. `schoolmates` carries the blocked flag the
      // report picker greys rows out with, and the round's candidate pool excludes blocked users.
      queryClient.invalidateQueries({ queryKey: ['blocked'] });
      queryClient.invalidateQueries({ queryKey: ['blockedPeople'] });
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
    }
  });
}
