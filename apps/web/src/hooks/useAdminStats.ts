import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/tanstack-react-start';
import { gqlFetch } from '../lib/graphql';

const ADMIN_STATS_QUERY = /* GraphQL */ `
  query AdminStats {
    adminStats {
      schools
      users
      polls
      votes
      infiniteAura
      reports
    }
  }
`;

export type AdminStats = { schools: number; users: number; polls: number; votes: number; infiniteAura: number; reports: number };
type Response = { adminStats: AdminStats };

/* Doubles as the "am I admin" signal used throughout the admin dashboard: this query is
   admin-gated server-side, so success means admin and a GraphQL error means not — no client-side
   Clerk claim introspection needed, the server's own requireAdmin check stays the single source
   of truth. */
export function useAdminStats() {
  const { getToken, isSignedIn } = useAuth();

  return useQuery({
    queryKey: ['adminStats'],
    queryFn: async () => {
      const token = await getToken();
      const { adminStats } = await gqlFetch<Response>(ADMIN_STATS_QUERY, undefined, token);
      return adminStats;
    },
    enabled: isSignedIn === true,
    retry: false
  });
}
