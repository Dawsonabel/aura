import { useAuth } from '@clerk/tanstack-react-start';
import { useReportUser as useSharedReportUser, type ReportUserInput } from '@aura/api-client';
import { gqlFetch } from '../lib/graphql';

export type { ReportUserInput };

export function useReportUser() {
  const { getToken } = useAuth();
  return useSharedReportUser({ gqlFetch, getToken });
}
