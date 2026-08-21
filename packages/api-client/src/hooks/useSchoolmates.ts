import { useQuery } from '@tanstack/react-query';
import type { GqlFetch } from '../client';
import type { FriendState } from './useFriends';

const SCHOOLMATES_QUERY = /* GraphQL */ `
  query Schoolmates {
    schoolmates {
      id
      firstName
      lastName
      username
      grade
      photo
      friendState
    }
  }
`;

export type Schoolmate = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  grade: string | null;
  photo: string | null;
  /* Where you and this person stand: friends, you've asked, they've asked, or nothing. The only thing
     the friend graph exposes about somebody else, and it describes the pair rather than them — their
     own friend list and count stay private (see the `friends` field resolver). */
  friendState: FriendState;
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
