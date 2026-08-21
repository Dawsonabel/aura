import { Pressable, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { AuraIcon, ICON_WEIGHT, ICON_WEIGHT_ACTIVE, type AuraIconName } from './AuraIcon';

// The 3A redesign replaces the old breadcrumb-style prev/next header with a fixed bottom bar
// showing all four destinations at once. Add+ and About aren't part of this bar — see the
// handoff's "Not designed" note — their routes still exist but currently have no nav entry point.
export const TABS = ['aura', 'inbox', 'ranks', 'profile'] as const;
export type Tab = (typeof TABS)[number];

/* This tab holds the aura other people gave you, which is the app's own word for its score
   everywhere else. It used to be "Flames" — the predecessor app's word — and nothing in the codebase
   says flame about a received pick any more.

   **`flame` survives as an icon name, and means streak and only streak.** It is a literal fire glyph
   and it sits beside a separate `aura` glyph in AuraIcon's set, so a well-meaning search-and-replace
   that finishes the rename by renaming this too collides the two icons — and it typechecks, because
   AuraIconName is derived from the keys, so the key and its callers stay consistent while pointing at
   the wrong drawing. The streak pill on the Vote header is what draws it. */
/* Each tab lights up in its own accent instead of all four sharing mint. The palette is the app's
   existing four — mint / pink / yellow / purple — so a tab's colour is one you've already met
   somewhere: mint is the safe-action colour on the Vote screen, pink is what a pick looks like,
   yellow is what a superlative looks like, purple is Infinite Aura and the "see you at midnight" tag.

   Inactive stays a single grey for all four. The colour is the *selection*, so spending it on
   unselected tabs would make the bar a rainbow with nothing standing out. */
const INACTIVE = '#848286';

/* The labels are gone from the bar but not from the code — they're what a screen reader announces
   now that there is nothing to read. Four destinations with distinct glyphs and a colour each don't
   need the words underneath, and dropping them buys the icons the room to be seen. */
const ITEMS: { tab: Tab; href: Href; icon: AuraIconName; label: string; active: string }[] = [
  { tab: 'aura', href: '/aura', icon: 'ballot', label: 'Vote', active: '#6BF2C2' },
  { tab: 'inbox', href: '/inbox', icon: 'aura', label: 'Aura', active: '#FF5CA8' },
  { tab: 'ranks', href: '/ranks', icon: 'trophy', label: 'Ranks', active: '#FFD84D' },
  { tab: 'profile', href: '/profile', icon: 'person', label: 'Me', active: '#7C5CFF' }
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
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      /* The label the bar no longer prints. Without it each tab announces as nothing at all. */
      accessibilityLabel={item.label}
      className="w-[78px] items-center justify-center"
      style={{ position: 'relative', height: 46 }}
    >
      {badge !== undefined && (
        <View
          className="items-center justify-center rounded-pill bg-pink"
          style={{ position: 'absolute', top: -2, right: 12, minWidth: 20, height: 20, borderWidth: 2, borderColor: '#403E41', zIndex: 1 }}
        >
          <Text className="font-nunito-900 px-1 text-[11px] text-white">{badge}</Text>
        </View>
      )}
      {/* 15A: "The active tab keeps its colour and goes to weight 2.6 — no filled duplicate needed."
          With the words gone this is the only thing carrying the tab, so it's sized to be read as a
          shape rather than as a marker above a caption. */}
      <AuraIcon name={item.icon} size={31} color={color} weight={active ? ICON_WEIGHT_ACTIVE : ICON_WEIGHT} />
    </Pressable>
  );
}
