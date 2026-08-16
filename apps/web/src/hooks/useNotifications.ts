import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/tanstack-react-start';
import { gqlFetch } from '../lib/graphql';

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

export function useNotifications() {
  const { getToken, isSignedIn } = useAuth();

  return useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const token = await getToken();
      const { notifications } = await gqlFetch<Response>(NOTIFICATIONS_QUERY, undefined, token);
      return notifications;
    },
    enabled: isSignedIn === true
  });
}
