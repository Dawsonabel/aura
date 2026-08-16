import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/tanstack-react-start';
import { gqlFetch } from '../lib/graphql';

const BLOCKED_QUERY = /* GraphQL */ `
  query Blocked {
    blocked {
      id
      firstName
      lastName
    }
  }
`;

export type BlockedUser = { id: string; firstName: string | null; lastName: string | null };
type Response = { blocked: BlockedUser[] };

export function useBlocked() {
  const { getToken, isSignedIn } = useAuth();

  return useQuery({
    queryKey: ['blocked'],
    queryFn: async () => {
      const token = await getToken();
      const { blocked } = await gqlFetch<Response>(BLOCKED_QUERY, undefined, token);
      return blocked;
    },
    enabled: isSignedIn === true
  });
}
