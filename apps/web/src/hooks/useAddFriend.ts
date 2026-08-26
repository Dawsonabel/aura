import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/tanstack-react-start';
import { gqlFetch } from '../lib/graphql';

const ADD_FRIEND_MUTATION = /* GraphQL */ `
  mutation AddFriend($userId: ID!) {
    addFriend(userId: $userId)
  }
`;

export function useAddFriend() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      const token = await getToken();
      const { addFriend } = await gqlFetch<{ addFriend: string[] }>(ADD_FRIEND_MUTATION, { userId }, token);
      return addFriend;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['friends'] });
    }
  });
}
