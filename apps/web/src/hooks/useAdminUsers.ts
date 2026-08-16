import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/tanstack-react-start';
import { gqlFetch } from '../lib/graphql';

const USERS_QUERY = /* GraphQL */ `
  query Users($schoolId: ID) {
    users(schoolId: $schoolId) {
      id
      schoolId
      firstName
      lastName
      username
      gender
      grade
      coins
      godMode
    }
  }
`;

export type AdminUser = {
  id: string;
  schoolId: string | null;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  gender: string | null;
  grade: string | null;
  coins: number;
  godMode: boolean | null;
};
type Response = { users: AdminUser[] };

export function useAdminUsers(schoolId?: string) {
  const { getToken, isSignedIn } = useAuth();

  return useQuery({
    queryKey: ['adminUsers', schoolId ?? null],
    queryFn: async () => {
      const token = await getToken();
      const { users } = await gqlFetch<Response>(USERS_QUERY, { schoolId }, token);
      return users;
    },
    enabled: isSignedIn === true
  });
}
