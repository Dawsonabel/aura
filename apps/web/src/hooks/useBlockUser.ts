import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/tanstack-react-start';
import { gqlFetch } from '../lib/graphql';

const BLOCK_MUTATION = /* GraphQL */ `
  mutation Block($userId: ID!) {
    block(userId: $userId)
  }
`;

export function useBlockUser() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      const token = await getToken();
      const { block } = await gqlFetch<{ block: string[] }>(BLOCK_MUTATION, { userId }, token);
      return block;
    },
    onSuccess: () => {
      // Blocking also drops the friendship server-side (see schema.ts's block resolver), so both
      // lists need refreshing, not just ['blocked'].
      queryClient.invalidateQueries({ queryKey: ['blocked'] });
      queryClient.invalidateQueries({ queryKey: ['friends'] });
    }
  });
}
