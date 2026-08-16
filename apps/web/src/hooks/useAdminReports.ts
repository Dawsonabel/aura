import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/tanstack-react-start';
import { gqlFetch } from '../lib/graphql';

const ADMIN_REPORTS_QUERY = /* GraphQL */ `
  query AdminReports {
    reports {
      id
      byName
      targetName
      reason
      status
      ts
    }
  }
`;

export type AdminReport = { id: string; byName: string; targetName: string; reason: string; status: string; ts: string };
type Response = { reports: AdminReport[] };

export function useAdminReports() {
  const { getToken, isSignedIn } = useAuth();

  return useQuery({
    queryKey: ['adminReports'],
    queryFn: async () => {
      const token = await getToken();
      const { reports } = await gqlFetch<Response>(ADMIN_REPORTS_QUERY, undefined, token);
      return reports;
    },
    enabled: isSignedIn === true
  });
}
