import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { GqlFetch } from '../client';
import type { Me } from './useMe';

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

export type UseUpdateMeParams = {
  gqlFetch: GqlFetch;
  getToken: () => Promise<string | null | undefined>;
};

export function useUpdateMe({ gqlFetch, getToken }: UseUpdateMeParams) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateMeInput) => {
      const token = await getToken();
      const { updateMe } = await gqlFetch<UpdateMeResult>(UPDATE_ME_MUTATION, input, token);
      return updateMe;
    },
    onSuccess: updated => {
      // Patches the cache with the mutation's own response *before* invalidating, so a
      // component that (re)mounts a useMe() observer right after this (e.g. navigating away
      // on onboarding's last step) reads the fresh value immediately instead of whatever was
      // cached pre-mutation — invalidateQueries alone only refetches *active* observers, and
      // there isn't necessarily one mounted at the moment this fires.
      queryClient.setQueryData<Me>(['me'], old => (old ? { ...old, ...updated } : old));
      queryClient.invalidateQueries({ queryKey: ['me'] });
    }
  });
}
