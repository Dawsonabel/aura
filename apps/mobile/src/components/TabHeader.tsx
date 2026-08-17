import { Pressable, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';

// Fixed order from the old app's PAGES array — `aura` is the default landing tab. Matches
// apps/web's TabHeader.
export const TABS = ['add', 'inbox', 'aura', 'profile', 'about'] as const;
export type Tab = (typeof TABS)[number];

const LABELS: Record<Tab, string> = { add: 'Add+', inbox: 'Inbox', aura: 'Aura', profile: 'Profile', about: 'About' };
const PATHS: Record<Tab, Href> = { add: '/add', inbox: '/inbox', aura: '/aura', profile: '/profile', about: '/about' };

/* Not generic chrome — this bar IS the primary nav: it shows the previous/next tab names as tap
   targets either side of the current one, mirroring apps/web's TabHeader (data-only navigation,
   not a traditional icon tab bar). */
export function TabHeader({ current, unreadCount = 0 }: { current: Tab; unreadCount?: number }) {
  const router = useRouter();
  const index = TABS.indexOf(current);
  const prev = TABS[index - 1];
  const next = TABS[index + 1];

  return (
    <View className="flex-row items-center justify-between border-b border-gray-200 p-4">
      <HeaderSlot tab={prev} unreadCount={unreadCount} onPress={tab => router.replace(PATHS[tab])} />
      <Text className="border-b-2 border-black font-semibold">{LABELS[current]}</Text>
      <HeaderSlot tab={next} unreadCount={unreadCount} onPress={tab => router.replace(PATHS[tab])} />
    </View>
  );
}

function HeaderSlot({
  tab,
  unreadCount,
  onPress
}: {
  tab: Tab | undefined;
  unreadCount: number;
  onPress: (tab: Tab) => void;
}) {
  if (!tab) return <Text className="opacity-0">·</Text>;
  return (
    <Pressable onPress={() => onPress(tab)}>
      <Text className="text-gray-500">
        {LABELS[tab]}
        {tab === 'inbox' && unreadCount > 0 ? ` (${unreadCount})` : ''}
      </Text>
    </Pressable>
  );
}
