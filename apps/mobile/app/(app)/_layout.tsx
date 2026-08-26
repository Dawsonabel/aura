import { useEffect } from 'react';
import { Slot, useIsFocused, usePathname, useRouter } from 'expo-router';
import { View } from 'react-native';
import { useAuth } from '@clerk/expo';
import { useMe } from '../../src/hooks/useMe';
import { useAuras } from '../../src/hooks/useAuras';
import { TabHeader } from '../../src/components/TabHeader';

export default function AppLayout() {
  const { isSignedIn } = useAuth();
  const { data: me } = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const isFocused = useIsFocused();

  // Same focus guard as index.tsx, for the same reason: this layout stays mounted underneath
  // whatever it redirected to, and a second replace() from here remounts that screen from scratch.
  // `dismissTo` reuses the `/` already below this group rather than stacking another copy.
  useEffect(() => {
    if (!isFocused) return;
    if (isSignedIn === false) router.dismissTo('/');
    else if (me && me.onboarded === false) router.replace('/onboarding');
  }, [isFocused, isSignedIn, me, router]);

  // The URL's last path segment (e.g. /aura -> "aura") tells us which tab is active — matches
  // apps/web's _app.tsx. `(app)` is a route group, so it never shows up in the pathname.
  const current = pathname.split('/').pop() || 'aura';

  // Fetched here (not just inside the Inbox route) so the header badge shows from any tab.
  const { data: auras } = useAuras();
  const unreadCount = auras?.auras.filter(f => f.unread).length ?? 0;

  return (
    <View className="flex-1">
      {/* No padding/background here — each redesigned screen (see aura.tsx) owns its own
          full-bleed `ground` background and edge insets; the not-yet-redesigned screens
          (inbox/profile/add/about) still render on the platform default until their own pass. */}
      <View className="flex-1">
        <Slot />
      </View>
      <View className="bg-ground px-[21px] pb-[28px] pt-3">
        <TabHeader current={current} unreadCount={unreadCount} />
      </View>
    </View>
  );
}
