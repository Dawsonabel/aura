import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/tanstack-react-start';
import { gqlFetch } from '../lib/graphql';

const DELETE_POLL_MUTATION = /* GraphQL */ `
  mutation DeletePoll($id: ID!) {
    deletePoll(id: $id)
  }
`;

export function useDeletePoll() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      const { deletePoll } = await gqlFetch<{ deletePoll: boolean }>(DELETE_POLL_MUTATION, { id }, token);
      return deletePoll;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adminPolls'] })
  });
}
