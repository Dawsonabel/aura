import { useQuery } from '@tanstack/react-query';
import type { GqlFetch } from '../client';

const SCHOOLS_QUERY = /* GraphQL */ `
  query Schools {
    schools {
      id
      name
      city
      userCount
    }
  }
`;

/* `userCount` backs the school picker's "312 kids already here" line — README §8 calls that
   deliberate social proof, so it's part of the query rather than an optional extra. The resolver
   (getSchoolsWithUserCounts) already computes it. */
export type School = { id: string; name: string; city: string; userCount: number };
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
