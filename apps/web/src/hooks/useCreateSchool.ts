import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/tanstack-react-start';
import { gqlFetch } from '../lib/graphql';

const CREATE_SCHOOL_MUTATION = /* GraphQL */ `
  mutation CreateSchool($name: String!, $city: String) {
    createSchool(name: $name, city: $city) {
      id
      name
      city
    }
  }
`;

export type CreateSchoolInput = { name: string; city?: string };

export function useCreateSchool() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateSchoolInput) => {
      const token = await getToken();
      const { createSchool } = await gqlFetch<{ createSchool: unknown }>(CREATE_SCHOOL_MUTATION, input, token);
      return createSchool;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schools'] })
  });
}
