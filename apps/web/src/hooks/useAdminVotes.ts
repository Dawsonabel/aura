import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/tanstack-react-start';
import { gqlFetch } from '../lib/graphql';

const ADMIN_VOTES_QUERY = /* GraphQL */ `
  query AdminVotes($limit: Int) {
    votes(limit: $limit) {
      id
      voterName
      targetName
      text
      ts
    }
  }
`;

export type AdminVote = { id: string; voterName: string; targetName: string; text: string; ts: string };
type Response = { votes: AdminVote[] };

export function useAdminVotes(limit?: number) {
  const { getToken, isSignedIn } = useAuth();

  return useQuery({
    queryKey: ['adminVotes', limit ?? null],
    queryFn: async () => {
      const token = await getToken();
      const { votes } = await gqlFetch<Response>(ADMIN_VOTES_QUERY, { limit }, token);
      return votes;
    },
    enabled: isSignedIn === true
  });
}
