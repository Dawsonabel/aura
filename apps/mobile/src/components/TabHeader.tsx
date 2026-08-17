import { Pressable, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { AuraIcon, ICON_WEIGHT, ICON_WEIGHT_ACTIVE, type AuraIconName } from './AuraIcon';

// The 3A redesign replaces the old breadcrumb-style prev/next header with a fixed bottom bar
// showing all four destinations at once. Add+ and About aren't part of this bar — see the
// handoff's "Not designed" note — their routes still exist but currently have no nav entry point.
export const TABS = ['aura', 'inbox', 'ranks', 'profile'] as const;
export type Tab = (typeof TABS)[number];

/* "AURA", not "FLAMES": flames was Gas's word, and the thing this tab holds is the aura other people
   gave you — which is the app's own name for its score everywhere else now.

   15A gives the tab its own icon rather than the flame, for the same reason: the flame belonged to the
   old name, and it was doing double duty as the streak pill on the Vote header. `flame` now means
   streak and only streak. */
/* Each tab lights up in its own accent instead of all four sharing mint. The palette is the app's
   existing four — mint / pink / yellow / purple — so a tab's colour is one you've already met
   somewhere: mint is the safe-action colour on the Vote screen, pink is what a pick looks like,
   yellow is what a superlative looks like, purple is God Mode and the "see you at midnight" tag.

   Inactive stays a single grey for all four. The colour is the *selection*, so spending it on
   unselected tabs would make the bar a rainbow with nothing standing out. */
const INACTIVE = '#848286';

const ITEMS: { tab: Tab; href: Href; icon: AuraIconName; label: string; active: string }[] = [
  { tab: 'aura', href: '/aura', icon: 'ballot', label: 'VOTE', active: '#6BF2C2' },
  { tab: 'inbox', href: '/inbox', icon: 'aura', label: 'AURA', active: '#FF5CA8' },
  { tab: 'ranks', href: '/ranks', icon: 'trophy', label: 'RANKS', active: '#FFD84D' },
  { tab: 'profile', href: '/profile', icon: 'person', label: 'ME', active: '#7C5CFF' }
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
  item: { tab: Tab; icon: AuraIconName; label: string; active: string };
  active: boolean;
  badge: number | undefined;
  onPress: () => void;
}) {
  const color = active ? item.active : INACTIVE;
  return (
    <Pressable onPress={onPress} className="w-[78px] items-center gap-1" style={{ position: 'relative' }}>
      {badge !== undefined && (
        <View
          className="items-center justify-center rounded-pill bg-pink"
          style={{ position: 'absolute', top: -4, right: 17, minWidth: 20, height: 20, borderWidth: 2, borderColor: '#403E41', zIndex: 1 }}
        >
          <Text className="font-nunito-900 px-1 text-[11px] text-white">{badge}</Text>
        </View>
      )}
      {/* 15A: "The active tab keeps its mint colour and goes to weight 2.6 — no filled duplicate
          needed." The mint pill that used to sit behind the active emoji is gone with it; the emoji
          needed a background to read as selected, a two-state stroke icon doesn't. */}
      <AuraIcon name={item.icon} size={24} color={color} weight={active ? ICON_WEIGHT_ACTIVE : ICON_WEIGHT} />
      <Text className="font-nunito-900 text-[11px]" style={{ color }}>
        {item.label}
      </Text>
    </Pressable>
  );
}
