import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { GqlFetch } from '../client';

const MARK_NOTIFICATIONS_READ_MUTATION = /* GraphQL */ `
  mutation MarkNotificationsRead {
    markNotificationsRead
  }
`;

export type UseMarkNotificationsReadParams = {
  gqlFetch: GqlFetch;
  getToken: () => Promise<string | null | undefined>;
};

export function useMarkNotificationsRead({ gqlFetch, getToken }: UseMarkNotificationsReadParams) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const { markNotificationsRead } = await gqlFetch<{ markNotificationsRead: boolean }>(MARK_NOTIFICATIONS_READ_MUTATION, undefined, token);
      return markNotificationsRead;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] })
  });
}
