import { useEffect } from 'react';
import { Slot, usePathname, useRouter } from 'expo-router';
import { View } from 'react-native';
import { useAuth } from '@clerk/expo';
import { useMe } from '../../src/hooks/useMe';
import { useFlames } from '../../src/hooks/useFlames';
import { TabHeader, type Tab } from '../../src/components/TabHeader';

export default function AppLayout() {
  const { isSignedIn } = useAuth();
  const { data: me } = useMe();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isSignedIn === false) router.replace('/');
    else if (me && me.onboarded === false) router.replace('/onboarding');
  }, [isSignedIn, me, router]);

  // The URL's last path segment (e.g. /aura -> "aura") tells us which tab is active — matches
  // apps/web's _app.tsx. `(app)` is a route group, so it never shows up in the pathname.
  const current = (pathname.split('/').pop() || 'aura') as Tab;

  // Fetched here (not just inside the Inbox route) so the header badge shows from any tab.
  const { data: flames } = useFlames();
  const unreadCount = flames?.flames.filter(f => f.unread).length ?? 0;

  return (
    <View className="flex-1">
      <TabHeader current={current} unreadCount={unreadCount} />
      <View className="flex-1 p-4">
        <Slot />
      </View>
    </View>
  );
}
