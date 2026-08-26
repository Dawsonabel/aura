import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/tanstack-react-start';
import { gqlFetch } from '../lib/graphql';

const REMOVE_FRIEND_MUTATION = /* GraphQL */ `
  mutation RemoveFriend($userId: ID!) {
    removeFriend(userId: $userId)
  }
`;

export function useRemoveFriend() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      const token = await getToken();
      const { removeFriend } = await gqlFetch<{ removeFriend: string[] }>(REMOVE_FRIEND_MUTATION, { userId }, token);
      return removeFriend;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['friends'] })
  });
}
