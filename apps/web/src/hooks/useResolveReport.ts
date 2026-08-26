import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/tanstack-react-start';
import { gqlFetch } from '../lib/graphql';

const RESOLVE_REPORT_MUTATION = /* GraphQL */ `
  mutation ResolveReport($id: ID!) {
    resolveReport(id: $id) {
      id
      status
    }
  }
`;

export function useResolveReport() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      const { resolveReport } = await gqlFetch<{ resolveReport: unknown }>(RESOLVE_REPORT_MUTATION, { id }, token);
      return resolveReport;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adminReports'] })
  });
}
