import { useQuery } from '@tanstack/react-query';
import { gqlFetch } from '../lib/graphql';

const SCHOOLS_QUERY = /* GraphQL */ `
  query Schools {
    schools {
      id
      name
      city
    }
  }
`;

type School = { id: string; name: string; city: string };
type SchoolsResult = { schools: School[] };

export function useSchools() {
  return useQuery({
    queryKey: ['schools'],
    queryFn: async () => (await gqlFetch<SchoolsResult>(SCHOOLS_QUERY)).schools
  });
}
