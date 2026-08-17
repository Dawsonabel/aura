import { Pressable, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';

// The 3A redesign replaces the old breadcrumb-style prev/next header with a fixed bottom bar
// showing all four destinations at once. Add+ and About aren't part of this bar — see the
// handoff's "Not designed" note — their routes still exist but currently have no nav entry point.
export const TABS = ['aura', 'inbox', 'ranks', 'profile'] as const;
export type Tab = (typeof TABS)[number];

const ITEMS: { tab: Tab; href: Href; glyph: string; label: string }[] = [
  { tab: 'aura', href: '/aura', glyph: '🗳', label: 'VOTE' },
  { tab: 'inbox', href: '/inbox', glyph: '🔥', label: 'FLAMES' },
  { tab: 'ranks', href: '/ranks', glyph: '🏆', label: 'RANKS' },
  { tab: 'profile', href: '/profile', glyph: '😎', label: 'ME' }
];

export function TabHeader({ current, unreadCount = 0 }: { current: string; unreadCount?: number }) {
  const router = useRouter();

  return (
    <View className="flex-row items-center justify-between rounded-26 bg-surface px-[6px] py-3">
      {ITEMS.map(item => (
        <TabItem
          key={item.tab}
          item={item}
          active={item.tab === current}
          badge={item.tab === 'inbox' && unreadCount > 0 ? unreadCount : undefined}
          onPress={() => router.replace(item.href)}
        />
      ))}
    </View>
  );
}

function TabItem({
  item,
  active,
  badge,
  onPress
}: {
  item: { tab: Tab; glyph: string; label: string };
  active: boolean;
  badge: number | undefined;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} className="w-[78px] items-center gap-1" style={{ position: 'relative' }}>
      {badge !== undefined && (
        <View
          className="items-center justify-center rounded-pill bg-pink"
          style={{ position: 'absolute', top: -2, right: 14, minWidth: 20, height: 20, borderWidth: 2, borderColor: '#403E41' }}
        >
          <Text className="font-nunito-900 px-1 text-[11px] text-white">{badge}</Text>
        </View>
      )}
      {active ? (
        <View className="rounded-pill bg-mint px-[14px] py-[6px]">
          <Text style={{ fontSize: 19 }}>{item.glyph}</Text>
        </View>
      ) : (
        <Text style={{ fontSize: 19 }}>{item.glyph}</Text>
      )}
      <Text className="font-nunito-900 text-[11px]" style={{ color: active ? '#6BF2C2' : '#848286' }}>
        {item.label}
      </Text>
    </Pressable>
  );
}
