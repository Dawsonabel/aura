import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/tanstack-react-start';
import { gqlFetch } from '../lib/graphql';

const DELETE_SCHOOL_MUTATION = /* GraphQL */ `
  mutation DeleteSchool($id: ID!) {
    deleteSchool(id: $id)
  }
`;

export function useDeleteSchool() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      const { deleteSchool } = await gqlFetch<{ deleteSchool: boolean }>(DELETE_SCHOOL_MUTATION, { id }, token);
      return deleteSchool;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schools'] })
  });
}
