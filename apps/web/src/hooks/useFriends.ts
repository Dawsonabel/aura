import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/tanstack-react-start';
import { gqlFetch } from '../lib/graphql';

const FRIENDS_QUERY = /* GraphQL */ `
  query Friends {
    friends {
      id
      firstName
      lastName
    }
  }
`;

export type FriendUser = { id: string; firstName: string | null; lastName: string | null };
type Response = { friends: FriendUser[] };

export function useFriends() {
  const { getToken, isSignedIn } = useAuth();

  return useQuery({
    queryKey: ['friends'],
    queryFn: async () => {
      const token = await getToken();
      const { friends } = await gqlFetch<Response>(FRIENDS_QUERY, undefined, token);
      return friends;
    },
    enabled: isSignedIn === true
  });
}
