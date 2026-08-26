import { useQuery } from '@tanstack/react-query';
import type { GqlFetch } from '../client';

const NOTIFICATIONS_QUERY = /* GraphQL */ `
  query Notifications {
    notifications {
      id
      text
      emoji
      ts
      read
    }
  }
`;

export type Notification = { id: string; text: string; emoji: string; ts: string; read: boolean };
type Response = { notifications: Notification[] };

export type UseNotificationsParams = {
  gqlFetch: GqlFetch;
  getToken: () => Promise<string | null | undefined>;
  enabled: boolean;
};

export function useNotifications({ gqlFetch, getToken, enabled }: UseNotificationsParams) {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const token = await getToken();
      const { notifications } = await gqlFetch<Response>(NOTIFICATIONS_QUERY, undefined, token);
      return notifications;
    },
    enabled
  });
}
