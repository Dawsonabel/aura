import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/tanstack-react-start';
import { gqlFetch } from '../lib/graphql';

const DELETE_VOTE_MUTATION = /* GraphQL */ `
  mutation DeleteVote($id: ID!) {
    deleteVote(id: $id)
  }
`;

export function useDeleteVote() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      const { deleteVote } = await gqlFetch<{ deleteVote: boolean }>(DELETE_VOTE_MUTATION, { id }, token);
      return deleteVote;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adminVotes'] })
  });
}
