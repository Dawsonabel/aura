import { useQuery } from '@tanstack/react-query';
import type { GqlFetch } from '../client';

const SCHOOLMATES_QUERY = /* GraphQL */ `
  query Schoolmates {
    schoolmates {
      id
      firstName
      lastName
      username
      grade
      followsMe
    }
  }
`;

export type Schoolmate = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  grade: string | null;
  /* Whether they follow you — 14A groups those first, because following back is the highest-yield tap
     on the screen. Only this one bit is exposed: who *they* follow stays private (see the `following`
     field resolver). */
  followsMe: boolean;
};

type Response = { schoolmates: Schoolmate[] };

export type UseSchoolmatesParams = {
  gqlFetch: GqlFetch;
  getToken: () => Promise<string | null | undefined>;
  enabled?: boolean;
};

/** Everyone at my school, blocked included — the searchable directory behind 8A's report picker. */
export function useSchoolmates({ gqlFetch, getToken, enabled = true }: UseSchoolmatesParams) {
  return useQuery({
    queryKey: ['schoolmates'],
    queryFn: async () => {
      const token = await getToken();
      const { schoolmates } = await gqlFetch<Response>(SCHOOLMATES_QUERY, undefined, token);
      return schoolmates;
    },
    enabled
  });
}
