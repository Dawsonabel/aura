import { useEffect } from 'react';
import { Slot, usePathname, useRouter } from 'expo-router';
import { View } from 'react-native';
import { useAuth } from '@clerk/expo';
import { useMe } from '../../src/hooks/useMe';
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

  return (
    <View className="flex-1">
      <TabHeader current={current} />
      <View className="flex-1 p-4">
        <Slot />
      </View>
    </View>
  );
}
