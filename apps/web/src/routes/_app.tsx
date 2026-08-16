import { createFileRoute, Outlet, useNavigate, useLocation } from '@tanstack/react-router';
import { useAuth } from '@clerk/tanstack-react-start';
import { useEffect } from 'react';
import { useMe } from '../hooks/useMe';
import { useFlames } from '../hooks/useFlames';
import { TabHeader, type Tab } from '../components/TabHeader';

export const Route = createFileRoute('/_app')({
  component: AppLayout
});

function AppLayout() {
  const { isSignedIn } = useAuth();
  const { data: me } = useMe();
  const navigate = useNavigate();

  useEffect(() => {
    if (isSignedIn === false) navigate({ to: '/' });
    else if (me && me.onboarded === false) navigate({ to: '/onboarding' });
  }, [isSignedIn, me, navigate]);

  // The URL's last path segment (e.g. /gas -> "gas") tells us which tab is active.
  const { pathname } = useLocation();
  const current = (pathname.split('/').pop() || 'gas') as Tab;

  // Fetched here (not just inside the Inbox route) so the header badge shows from any tab.
  const { data: flames } = useFlames();
  const unreadCount = flames?.flames.filter(f => f.unread).length ?? 0;

  return (
    <div className="flex min-h-screen flex-col">
      <TabHeader current={current} unreadCount={unreadCount} />
      <div className="flex-1 p-4">
        <Outlet />
      </div>
    </div>
  );
}
