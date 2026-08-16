import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/tanstack-react-start';
import { gqlFetch } from '../lib/graphql';

const UNBLOCK_MUTATION = /* GraphQL */ `
  mutation Unblock($userId: ID!) {
    unblock(userId: $userId)
  }
`;

export function useUnblockUser() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      const token = await getToken();
      const { unblock } = await gqlFetch<{ unblock: string[] }>(UNBLOCK_MUTATION, { userId }, token);
      return unblock;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['blocked'] })
  });
}
