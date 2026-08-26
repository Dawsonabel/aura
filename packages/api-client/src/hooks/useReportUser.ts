import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { GqlFetch } from '../client';

const REPORT_USER_MUTATION = /* GraphQL */ `
  mutation ReportUser($userId: ID, $reason: String) {
    reportUser(userId: $userId, reason: $reason)
  }
`;

export type ReportUserInput = { userId: string; reason: string | null };

export type UseReportUserParams = {
  gqlFetch: GqlFetch;
  getToken: () => Promise<string | null | undefined>;
};

export function useReportUser({ gqlFetch, getToken }: UseReportUserParams) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ReportUserInput) => {
      const token = await getToken();
      const { reportUser } = await gqlFetch<{ reportUser: boolean }>(REPORT_USER_MUTATION, input, token);
      return reportUser;
    },
    // A new report is what mutes Unblock on the blocked list, so that view is now stale.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['blockedPeople'] })
  });
}
