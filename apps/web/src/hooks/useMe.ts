import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/tanstack-react-start';
import { gqlFetch } from '../lib/graphql';

const ME_QUERY = /* GraphQL */ `
  query Me {
    me {
      id
      coins
      onboarded
    }
  }
`;

type MeResult = { me: { id: string; coins: number; onboarded: boolean } };

export function useMe() {
  const { getToken, isSignedIn } = useAuth();

  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const token = await getToken();
      const { me } = await gqlFetch<MeResult>(ME_QUERY, undefined, token);
      return me;
    },
    enabled: isSignedIn === true
  });
}
