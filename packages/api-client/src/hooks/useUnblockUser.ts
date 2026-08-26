import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { GqlFetch } from '../client';

const UNBLOCK_MUTATION = /* GraphQL */ `
  mutation Unblock($userId: ID!) {
    unblock(userId: $userId)
  }
`;

export type UseUnblockUserParams = {
  gqlFetch: GqlFetch;
  getToken: () => Promise<string | null | undefined>;
};

export function useUnblockUser({ gqlFetch, getToken }: UseUnblockUserParams) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      const token = await getToken();
      const { unblock } = await gqlFetch<{ unblock: string[] }>(UNBLOCK_MUTATION, { userId }, token);
      return unblock;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blocked'] });
      queryClient.invalidateQueries({ queryKey: ['blockedPeople'] });
      // Unblocking puts you both back in each other's rounds, which `me.blocked` gates.
      queryClient.invalidateQueries({ queryKey: ['me'] });
    }
  });
}
