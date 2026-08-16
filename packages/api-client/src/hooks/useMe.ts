import { useQuery } from '@tanstack/react-query';
import type { GqlFetch } from '../client';

const ME_QUERY = /* GraphQL */ `
  query Me {
    me {
      id
      coins
      onboarded
      godMode
      firstName
      lastName
      username
      gender
      hideTopFlames
    }
  }
`;

export type Me = {
  id: string;
  coins: number;
  onboarded: boolean;
  godMode: boolean | null;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  gender: string | null;
  hideTopFlames: boolean | null;
};

type MeResult = { me: Me };

export type UseMeParams = {
  gqlFetch: GqlFetch;
  getToken: () => Promise<string | null | undefined>;
  enabled: boolean;
};

export function useMe({ gqlFetch, getToken, enabled }: UseMeParams) {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const token = await getToken();
      const { me } = await gqlFetch<MeResult>(ME_QUERY, undefined, token);
      return me;
    },
    enabled
  });
}
