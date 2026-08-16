import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/tanstack-react-start';
import { gqlFetch } from '../lib/graphql';

const ADMIN_POLLS_QUERY = /* GraphQL */ `
  query AdminPolls {
    polls {
      id
      emoji
      text
      color
      enabled
      schoolId
    }
  }
`;

export type AdminPoll = { id: string; emoji: string; text: string; color: string; enabled: boolean; schoolId: string | null };
type Response = { polls: AdminPoll[] };

export function useAdminPolls() {
  const { getToken, isSignedIn } = useAuth();

  return useQuery({
    queryKey: ['adminPolls'],
    queryFn: async () => {
      const token = await getToken();
      const { polls } = await gqlFetch<Response>(ADMIN_POLLS_QUERY, undefined, token);
      return polls;
    },
    enabled: isSignedIn === true
  });
}
