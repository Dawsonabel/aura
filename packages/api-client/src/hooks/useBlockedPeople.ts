import { useQuery } from '@tanstack/react-query';
import type { GqlFetch } from '../client';

const BLOCKED_PEOPLE_QUERY = /* GraphQL */ `
  query BlockedPeople {
    blockedPeople {
      blockedAt
      reportOpen
      user {
        id
        firstName
        lastName
        username
        grade
      }
    }
  }
`;

export type BlockedPerson = {
  blockedAt: string | null;
  reportOpen: boolean;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    username: string | null;
    grade: string | null;
  };
};

type Response = { blockedPeople: BlockedPerson[] };

export type UseBlockedPeopleParams = {
  gqlFetch: GqlFetch;
  getToken: () => Promise<string | null | undefined>;
  enabled?: boolean;
};

/* 8A's blocked list. Richer than the plain `blocked` query (which apps/web's profile still uses):
   carries when each block happened and whether the caller's report on that person is still open. */
export function useBlockedPeople({ gqlFetch, getToken, enabled = true }: UseBlockedPeopleParams) {
  return useQuery({
    queryKey: ['blockedPeople'],
    queryFn: async () => {
      const token = await getToken();
      const { blockedPeople } = await gqlFetch<Response>(BLOCKED_PEOPLE_QUERY, undefined, token);
      return blockedPeople;
    },
    enabled
  });
}
