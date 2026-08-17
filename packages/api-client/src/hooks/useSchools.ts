import { useQuery } from '@tanstack/react-query';
import type { GqlFetch } from '../client';

const SCHOOLS_QUERY = /* GraphQL */ `
  query Schools {
    schools {
      id
      name
      city
    }
  }
`;

export type School = { id: string; name: string; city: string };
type SchoolsResult = { schools: School[] };

export type UseSchoolsParams = {
  gqlFetch: GqlFetch;
};

export function useSchools({ gqlFetch }: UseSchoolsParams) {
  return useQuery({
    queryKey: ['schools'],
    queryFn: async () => (await gqlFetch<SchoolsResult>(SCHOOLS_QUERY)).schools
  });
}
