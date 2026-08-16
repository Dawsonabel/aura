import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/tanstack-react-start';
import { gqlFetch } from '../lib/graphql';

const UPDATE_SCHOOL_MUTATION = /* GraphQL */ `
  mutation UpdateSchool($id: ID!, $name: String, $city: String) {
    updateSchool(id: $id, name: $name, city: $city) {
      id
      name
      city
    }
  }
`;

export type UpdateSchoolInput = { id: string; name?: string; city?: string };

export function useUpdateSchool() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateSchoolInput) => {
      const token = await getToken();
      const { updateSchool } = await gqlFetch<{ updateSchool: unknown }>(UPDATE_SCHOOL_MUTATION, input, token);
      return updateSchool;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schools'] })
  });
}
