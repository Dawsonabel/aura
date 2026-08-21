import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/tanstack-react-start';
import { gqlFetch } from '../lib/graphql';

const ADMIN_UPDATE_USER_MUTATION = /* GraphQL */ `
  mutation AdminUpdateUser(
    $id: ID!, $schoolId: ID, $grade: String, $coins: Int, $infiniteAura: Boolean,
    $firstName: String, $lastName: String, $username: String
  ) {
    adminUpdateUser(
      id: $id, schoolId: $schoolId, grade: $grade, coins: $coins, infiniteAura: $infiniteAura,
      firstName: $firstName, lastName: $lastName, username: $username
    ) {
      id
      schoolId
      firstName
      lastName
      username
      grade
      coins
      infiniteAura
    }
  }
`;

export type AdminUpdateUserInput = {
  id: string;
  schoolId?: string;
  grade?: string;
  coins?: number;
  infiniteAura?: boolean;
  firstName?: string;
  lastName?: string;
  username?: string;
};

export function useAdminUpdateUser() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: AdminUpdateUserInput) => {
      const token = await getToken();
      const { adminUpdateUser } = await gqlFetch<{ adminUpdateUser: unknown }>(ADMIN_UPDATE_USER_MUTATION, input, token);
      return adminUpdateUser;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adminUsers'] })
  });
}
