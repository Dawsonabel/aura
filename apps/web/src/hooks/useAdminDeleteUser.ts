import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/tanstack-react-start';
import { gqlFetch } from '../lib/graphql';

const ADMIN_DELETE_USER_MUTATION = /* GraphQL */ `
  mutation AdminDeleteUser($id: ID!) {
    adminDeleteUser(id: $id)
  }
`;

export function useAdminDeleteUser() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      const { adminDeleteUser } = await gqlFetch<{ adminDeleteUser: boolean }>(ADMIN_DELETE_USER_MUTATION, { id }, token);
      return adminDeleteUser;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adminUsers'] })
  });
}
