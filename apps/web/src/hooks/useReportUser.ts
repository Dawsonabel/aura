import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@clerk/tanstack-react-start';
import { gqlFetch } from '../lib/graphql';

const REPORT_USER_MUTATION = /* GraphQL */ `
  mutation ReportUser($userId: ID, $reason: String) {
    reportUser(userId: $userId, reason: $reason)
  }
`;

export type ReportUserInput = { userId: string; reason: string | null };

export function useReportUser() {
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async (input: ReportUserInput) => {
      const token = await getToken();
      const { reportUser } = await gqlFetch<{ reportUser: boolean }>(REPORT_USER_MUTATION, input, token);
      return reportUser;
    }
  });
}
