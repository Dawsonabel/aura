import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/tanstack-react-start';
import { gqlFetch } from '../lib/graphql';

const UPDATE_ME_MUTATION = /* GraphQL */ `
  mutation UpdateMe(
    $firstName: String, $lastName: String, $username: String, $gender: String, $grade: String,
    $age: Int, $schoolId: ID, $onboarded: Boolean, $hideTopFlames: Boolean
  ) {
    updateMe(
      firstName: $firstName, lastName: $lastName, username: $username, gender: $gender, grade: $grade,
      age: $age, schoolId: $schoolId, onboarded: $onboarded, hideTopFlames: $hideTopFlames
    ) {
      id
      firstName
      lastName
      username
      gender
      grade
      age
      schoolId
      onboarded
      hideTopFlames
    }
  }
`;

export type UpdateMeInput = {
  firstName?: string;
  lastName?: string;
  username?: string;
  gender?: string;
  grade?: string;
  age?: number;
  schoolId?: string;
  onboarded?: boolean;
  hideTopFlames?: boolean;
};

type UpdateMeResult = { updateMe: { id: string; onboarded: boolean; [key: string]: unknown } };

export function useUpdateMe() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateMeInput) => {
      const token = await getToken();
      const { updateMe } = await gqlFetch<UpdateMeResult>(UPDATE_ME_MUTATION, input, token);
      return updateMe;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] })
  });
}
