import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useFlames, type Flame } from '../../src/hooks/useFlames';
import { useMarkFlamesRead } from '../../src/hooks/useMarkFlamesRead';
import { useNotifications, type Notification } from '../../src/hooks/useNotifications';
import { useMarkNotificationsRead } from '../../src/hooks/useMarkNotificationsRead';
import { useRevealFlame } from '../../src/hooks/useRevealFlame';
import { useRevealFlameName } from '../../src/hooks/useRevealFlameName';
import { Overlay } from '../../src/components/Overlay';
import { GodModeOverlay } from '../../src/components/GodModeOverlay';

const GENDER_LABEL: Record<string, string> = { boy: 'Boy', girl: 'Girl', nonbinary: 'Non-binary' };

function flameSubtitle(f: Flame): string {
  if (f.anonymous) return `🔒 Anonymous · ${f.grade}`;
  let base = f.name ? `From ${f.name} · ${f.grade}` : f.initial ? `From ${f.initial}••• · ${f.grade}` : `Someone in ${f.grade} picked you`;
  if (f.repeatAdmirer) base += ` · 🔥×${f.pickCount}`;
  return base;
}

export default function Inbox() {
  const { data, isLoading } = useFlames();
  const markFlamesRead = useMarkFlamesRead();
  const { data: notifications } = useNotifications();
  const markNotificationsRead = useMarkNotificationsRead();

  // Freezes the unread list the moment `notifications` first loads, so marking them read below
  // (which invalidates and refetches the query) doesn't make the banner disappear out from under
  // the user. Computed during render — see https://react.dev/learn/you-might-not-need-an-effect —
  // rather than in an Effect, so it doesn't cost an extra render pass. Matches apps/web's Inbox.
  const [prevNotifications, setPrevNotifications] = useState(notifications);
  const [shownNotifications, setShownNotifications] = useState<Notification[] | null>(null);
  if (notifications !== prevNotifications) {
    setPrevNotifications(notifications);
    if (notifications && shownNotifications === null) {
      setShownNotifications(notifications.filter(n => !n.read));
    }
  }

  const [selectedFlameId, setSelectedFlameId] = useState<string | null>(null);
  const [godModeOpen, setGodModeOpen] = useState(false);

  // Opening the Inbox marks everything read immediately, same as apps/web — not gated behind
  // any user action. Runs once on mount only.
  useEffect(() => {
    markFlamesRead.mutate();
  }, []);

  // Consequence of the frozen unread list appearing — mirrors the mount-only mark-read Effect
  // above, just triggered once shownNotifications settles instead of on mount.
  useEffect(() => {
    if (shownNotifications?.length) markNotificationsRead.mutate();
  }, [shownNotifications, markNotificationsRead]);

  if (isLoading || !data) return <Text>Loading…</Text>;

  const secretAdmirer = data.flames.some(f => f.repeatAdmirer && !f.name);
  const selectedFlame = data.flames.find(f => f.id === selectedFlameId) || null;

  return (
    <ScrollView>
      <View className="gap-3">
        {data.godMode ? (
          <View className="rounded bg-purple-100 p-3">
            <Text className="text-sm">👑 God Mode active — hints unlocked</Text>
          </View>
        ) : (
          <Pressable onPress={() => setGodModeOpen(true)} className="rounded bg-gray-100 p-3">
            <Text className="text-sm">👀 See Who Likes You</Text>
          </Pressable>
        )}

        {secretAdmirer && (
          <View className="rounded bg-orange-100 p-3">
            <Text className="text-sm">
              🔥 <Text className="font-bold">You have a secret admirer!</Text>{' '}
              {data.godMode ? (
                'Open their flame to use a bonus name reveal.'
              ) : (
                <Text className="underline" onPress={() => setGodModeOpen(true)}>
                  Unlock God Mode to reveal them.
                </Text>
              )}
            </Text>
          </View>
        )}

        {shownNotifications?.map(n => (
          <View key={n.id} className="flex-row items-center gap-2 rounded bg-blue-50 p-2">
            <Text>{n.emoji || '🔔'}</Text>
            <Text className="text-sm">{n.text}</Text>
          </View>
        ))}

        {data.flames.length === 0 ? (
          <Text className="text-gray-500">No flames yet.{'\n'}Answer polls so friends can flame you up! 🔥</Text>
        ) : (
          data.flames.map(f => (
            <Pressable
              key={f.id}
              onPress={() => setSelectedFlameId(f.id)}
              className="flex-row items-center justify-between rounded border border-gray-300 p-3"
            >
              <View className="flex-1">
                <View className="flex-row items-center">
                  <Text className="font-medium">{f.q}</Text>
                  {f.repeatAdmirer && !f.name && (
                    <Text className="ml-2 rounded bg-orange-200 px-1 text-xs">🔥 secret admirer</Text>
                  )}
                </View>
                <Text className="text-sm text-gray-500">{flameSubtitle(f)}</Text>
              </View>
              <Text>{f.anonymous ? '🔒' : f.revealed || f.godMode ? '›' : '🔒'}</Text>
            </Pressable>
          ))
        )}
      </View>

      {selectedFlame && (
        <FlameDetail flame={selectedFlame} bonusRevealsLeft={data.bonusRevealsLeft} onClose={() => setSelectedFlameId(null)} />
      )}
      {godModeOpen && <GodModeOverlay onClose={() => setGodModeOpen(false)} />}
    </ScrollView>
  );
}

function FlameDetail({ flame, bonusRevealsLeft, onClose }: { flame: Flame; bonusRevealsLeft: number; onClose: () => void }) {
  const revealFlame = useRevealFlame();
  const revealFlameName = useRevealFlameName();
  const shown = flame.revealed || flame.godMode;

  return (
    <Overlay onClose={onClose} style={{ borderTopWidth: 8, borderTopColor: flame.color }}>
      <Text className="text-3xl">{flame.emoji}</Text>
      <Text className="text-lg font-semibold">{flame.q}</Text>
      {flame.repeatAdmirer && <Text className="text-sm text-orange-600">🔥 This person flamed you {flame.pickCount}×</Text>}

      <View className="my-4 flex-row flex-wrap gap-y-1">
        <DetailRow label="Gender" value={GENDER_LABEL[flame.gender] || flame.gender} />
        <DetailRow label="Grade" value={flame.grade} />
        <DetailRow label="First initial" value={flame.anonymous ? '🔒' : shown ? flame.initial || '?' : 'X'} />
        {flame.name && <DetailRow label="Name" value={flame.name} />}
      </View>

      <FlameDetailAction
        flame={flame}
        shown={shown}
        bonusRevealsLeft={bonusRevealsLeft}
        revealFlame={revealFlame}
        revealFlameName={revealFlameName}
      />

      <Pressable onPress={onClose} className="mt-4 rounded border border-gray-300 px-3 py-2">
        <Text className="text-center">Close</Text>
      </Pressable>
    </Overlay>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="w-1/2 flex-row justify-between pr-2">
      <Text className="text-sm text-gray-500">{label}</Text>
      <Text className="text-sm">{value}</Text>
    </View>
  );
}

function FlameDetailAction({
  flame,
  shown,
  bonusRevealsLeft,
  revealFlame,
  revealFlameName
}: {
  flame: Flame;
  shown: boolean;
  bonusRevealsLeft: number;
  revealFlame: ReturnType<typeof useRevealFlame>;
  revealFlameName: ReturnType<typeof useRevealFlameName>;
}) {
  if (flame.anonymous) return <Text className="text-sm">🔒 This admirer is anonymous (God Mode)</Text>;

  if (!shown) {
    return (
      <View className="gap-1">
        <Pressable onPress={() => revealFlame.mutate(flame.id)} className="rounded bg-black px-3 py-2">
          <Text className="text-center text-white">Reveal a hint · 🪙 1</Text>
        </Pressable>
        {revealFlame.isError && <Text className="text-sm text-red-600">{(revealFlame.error as Error).message}</Text>}
      </View>
    );
  }

  if (flame.godMode) {
    if (flame.name) return <Text className="text-sm">✅ It's {flame.name}</Text>;
    if (flame.repeatAdmirer) {
      if (bonusRevealsLeft <= 0) return <Text className="text-sm">No bonus reveals left</Text>;
      return (
        <View className="gap-1">
          <Pressable onPress={() => revealFlameName.mutate(flame.id)} className="rounded bg-black px-3 py-2">
            <Text className="text-center text-white">🔓 Reveal their full name · Bonus ({bonusRevealsLeft} left)</Text>
          </Pressable>
          {revealFlameName.isError && <Text className="text-sm text-red-600">{(revealFlameName.error as Error).message}</Text>}
        </View>
      );
    }
    return <Text className="text-sm">👑 First-initial hint unlocked</Text>;
  }

  return null;
}
