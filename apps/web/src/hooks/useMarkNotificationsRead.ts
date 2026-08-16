import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/tanstack-react-start';
import { gqlFetch } from '../lib/graphql';

const MARK_NOTIFICATIONS_READ_MUTATION = /* GraphQL */ `
  mutation MarkNotificationsRead {
    markNotificationsRead
  }
`;

export function useMarkNotificationsRead() {
  const { getToken } = useAuth();
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
