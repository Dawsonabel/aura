import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/expo';
import { useFlames, type Flame } from '../../src/hooks/useFlames';
import { useMarkFlamesRead } from '../../src/hooks/useMarkFlamesRead';
import { useNotifications, type Notification } from '../../src/hooks/useNotifications';
import { useMarkNotificationsRead } from '../../src/hooks/useMarkNotificationsRead';
import { useRevealFlame } from '../../src/hooks/useRevealFlame';
import { useRevealFlameName } from '../../src/hooks/useRevealFlameName';
import { Overlay } from '../../src/components/Overlay';
import { AuraIcon } from '../../src/components/AuraIcon';
import { flameGenderLabel } from '@aura/api-client';
import { EmptyState, InlineFailure, SkeletonBlock, SkeletonRows } from '../../src/components/stateKit';
import { InfoCard } from '../../src/components/settingsKit';
import { ToyShadow } from '../../src/components/ToyShadow';

/* 12A's row subtitles: "Girl · 11th grade · 🔒 name hidden" / "… · starts with J" /
   "✅ Revealed: Maya R." / "… · already opened". Gender is omitted when the voter chose not to say
   (flameGenderLabel returns null), so the line just starts with the grade.

   This row can print `grade` and `initial` straight because the payload only contains a clue whose tile
   is open — see the note on `revealed` in apps/api/src/flames.ts. It is not a second gate, and it must
   not become one: if a clue arrives here it has been bought, and if it hasn't been bought it isn't
   here. The grade *is* empty for an anonymous sender, though — no clue on that flame is buyable at
   all — so the pieces are joined rather than interpolated, or the line ends in a dangling separator. */
function flameSubtitle(f: Flame): string {
  if (f.anonymous) return ['🔒 Anonymous', f.grade].filter(Boolean).join(' · ');
  if (f.name) return `✅ Revealed: ${f.name}`;
  /* Too few people share this sender's gender+grade for those to be anonymous, so the server withheld
     them — see COHORT_FLOOR. The row still says whether it's been opened. */
  if (f.detailHidden) return f.initial ? `Someone at your school · starts with ${f.initial}` : f.unread ? 'Someone at your school · 🔒 name hidden' : 'Someone at your school · already opened';

  const gradeLabel = /^\d+$/.test(f.grade) ? `${f.grade}th grade` : f.grade;
  const parts = [flameGenderLabel(f.gender), gradeLabel].filter(Boolean) as string[];
  parts.push(f.initial ? `starts with ${f.initial}` : f.unread ? '🔒 name hidden' : 'already opened');
  return parts.join(' · ');
}

export default function Inbox() {
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useFlames();
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

  // Opening the Inbox marks everything read immediately, same as apps/web — not gated behind
  // any user action. Fires once auth is actually ready (not on raw mount) — a cold-start deep
  // link straight into this screen can render before @clerk/expo's async token cache resolves,
  // and this mutation needs a real token.
  useEffect(() => {
    if (isSignedIn) markFlamesRead.mutate();
  }, [isSignedIn]);

  // Consequence of the frozen unread list appearing — mirrors the mount-only mark-read Effect
  // above, just triggered once shownNotifications settles instead of on mount.
  // Depends on `.mutate` (stable across renders — see @tanstack/react-query's useMutation source:
  // it's wrapped in useCallback) rather than the whole `markNotificationsRead` object, which
  // useMutation() recreates on every render — depending on the object would re-fire this Effect,
  // and thus re-call the mutation, every time the mutation's own pending/success transitions
  // caused a re-render, looping indefinitely.
  useEffect(() => {
    if (shownNotifications?.length) markNotificationsRead.mutate();
  }, [shownNotifications, markNotificationsRead.mutate]);

  /* 10A: the real title renders immediately and only the data-dependent regions block out — the
     banner at its true height, then four staggered rows. A failure gets an inline retry instead,
     since the header above it is perfectly fine. This screen is still pre-redesign otherwise, so the
     skeleton mirrors the layout it has today. */
  if (isError) {
    return (
      <InboxShell subtitle={null}>
        <View className="mt-5">
          <InlineFailure
            icon="aura"
            title="Your aura didn't load"
            body="They're safe — we just couldn't fetch them. Nothing is lost."
            onRetry={() => refetch()}
          />
        </View>
      </InboxShell>
    );
  }
  if (isLoading || !data) {
    // 10A: real title immediately, only the data-dependent regions blocked out.
    return (
      <InboxShell subtitle={null}>
        <View className="mt-5">
          <SkeletonBlock height={72} radius={24} />
        </View>
        <View className="mt-5">
          <SkeletonRows n={4} />
        </View>
      </InboxShell>
    );
  }

  // Excludes anonymous flames — FlameDetailAction always shows the "anonymous (God Mode)" dead
  // end for those, never the bonus name-reveal this banner promises.
  const secretAdmirer = data.flames.some(f => f.repeatAdmirer && !f.name && !f.anonymous);
  const selectedFlame = data.flames.find(f => f.id === selectedFlameId) || null;

  const maxPickCount = data.flames.reduce((max, f) => (f.repeatAdmirer ? Math.max(max, f.pickCount) : max), 0);

  /* 12A's subtitle. `admirerCount` is the last 7 days and the list is the last 30, so a user with
     older-but-not-expired flames would otherwise read "Nobody's picked you yet this week" above a
     full list. Three cases, each true of the data actually on screen. */
  const subtitle =
    data.admirerCount > 0
      ? `${data.admirerCount} ${data.admirerCount === 1 ? 'person' : 'people'} picked you this week 👀`
      : data.flames.length > 0
        ? `+${data.flames.length} aura in the last 30 days`
        : "Nobody's picked you yet this week";

  return (
    <InboxShell subtitle={subtitle}>
      {data.flames.length === 0 ? (
        <FlamesEmpty onVote={() => router.replace('/aura')} />
      ) : (
        <>
          {/* The membership card. Renamed from God Mode with 15A, and the design's "free for 3 days" is
              still dropped — there is no trial configured in StoreKit, and that banner had already
              promised something the purchase flow doesn't do twice. */}
          {data.godMode ? (
            <View className="mt-5 flex-row items-center gap-3 rounded-24 bg-raised px-[19px] py-[17px]">
              <View className="flex-1">
                <Text className="font-fredoka-700 text-[20px] text-white">Infinite Aura is on</Text>
                <Text className="font-nunito-800 mt-[2px] text-[12.5px] text-ink-muted">
                  Every clue free, and first names
                </Text>
              </View>
              <AuraIcon name="aura" size={26} color="#6BF2C2" />
            </View>
          ) : (
            <View className="mt-5">
              <ToyShadow depth={5} shadowColor="#3FBF95" backgroundColor="#6BF2C2" radius={24} onPress={() => router.push('/infinite')}>
                <View className="flex-row items-center gap-3 px-[19px] py-[17px]">
                  <View className="flex-1">
                    <Text className="font-fredoka-700 text-[20px]" style={{ color: '#0A3B2C' }}>
                      See who picked you
                    </Text>
                    <Text className="font-nunito-800 mt-[2px] text-[12.5px]" style={{ color: '#12664C' }}>
                      Infinite Aura · every clue, and first names
                    </Text>
                  </View>
                  <AuraIcon name="aura" size={26} color="#0A3B2C" />
                </View>
              </ToyShadow>
            </View>
          )}

          {/* Repeat admirer. Count only — naming them is what God Mode is for. */}
          {maxPickCount >= 2 && (
            <View className="mt-[14px] flex-row items-center gap-[11px] rounded-20 bg-raised px-4 py-[14px]">
              <Text style={{ fontSize: 19 }}>🫣</Text>
              <Text className="font-nunito-800 flex-1 text-[13.5px] leading-[19px]" style={{ color: '#FFC9E4' }}>
                Somebody picked you {maxPickCount} times. Bold of them.
              </Text>
            </View>
          )}

          {shownNotifications?.map(n => (
            <View key={n.id} className="mt-[14px] flex-row items-center gap-[11px] rounded-20 bg-surface px-4 py-[14px]">
              <Text style={{ fontSize: 17 }}>{n.emoji || '🔔'}</Text>
              <Text className="font-nunito-700 flex-1 text-[13px] leading-[18.5px] text-ink-secondary">{n.text}</Text>
            </View>
          ))}

          <View className="mt-5 gap-[10px]">
            {data.flames.map(f => (
              /* Opens 16A's scratch card rather than the old detail overlay. The overlay is still below
                 for now, but nothing reaches it — see the note there. */
              <FlameRow key={f.id} flame={f} onPress={() => router.push({ pathname: '/clue', params: { id: f.id } })} />
            ))}
          </View>

          <Text className="font-nunito-800 py-4 text-center text-[12.5px] text-ink-faint">
            aura fades after 30 days ✨
          </Text>
        </>
      )}

      {selectedFlame && (
        <FlameDetail flame={selectedFlame} bonusRevealsLeft={data.bonusRevealsLeft} onClose={() => setSelectedFlameId(null)} />
      )}
    </InboxShell>
  );
}

/* Shared frame so the title and subtitle render identically across the loading, failed, empty and
   populated states — 10A's rule that real headers appear immediately depends on there being one. */
function InboxShell({ subtitle, children }: { subtitle: string | null; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      className="flex-1 bg-ground"
      contentContainerStyle={{ paddingTop: insets.top + 14, paddingHorizontal: 21, paddingBottom: 8 }}
      showsVerticalScrollIndicator={false}
    >
      <Text className="font-fredoka-700 text-[36px] leading-[38px] text-white">Your aura</Text>
      {subtitle ? (
        <Text className="font-nunito-700 mt-[6px] text-[14px] text-ink-muted">{subtitle}</Text>
      ) : (
        <View className="mt-[6px]">
          <SkeletonBlock height={14} width={190} />
        </View>
      )}
      {children}
    </ScrollView>
  );
}

/* 12A's four row states, driven entirely by data that already existed:
     unread            → cream card + NEW pill
     partly revealed   → cream card, subtitle carries the initial hint
     revealed by name  → cream card, mint "✅ Revealed: <name>"
     already opened    → dark `surface` card, muted text
   The emoji tile takes the poll's own colour, which is why it differs per row. */
function FlameRow({ flame, onPress }: { flame: Flame; onPress: () => void }) {
  const opened = !flame.unread;
  const body = (
    <View className="flex-row items-center gap-[13px] p-[15px]">
      <View
        className="h-[46px] w-[46px] items-center justify-center"
        style={{ borderRadius: 16, backgroundColor: opened ? '#4A474B' : flame.color || '#FF5CA8' }}
      >
        <Text style={{ fontSize: 23 }}>{flame.emoji}</Text>
      </View>
      <View className="flex-1">
        <Text
          className="font-nunito-900 text-[15px] leading-[19px]"
          style={{ color: opened ? '#C1C0C0' : '#2D2A2E' }}
        >
          {flame.q}
        </Text>
        <Text className="font-nunito-700 mt-[3px] text-[12.5px]" style={{ color: rowSubtitleColor(flame, opened) }}>
          {flameSubtitle(flame)}
        </Text>
      </View>
      {flame.unread ? (
        <View className="rounded-pill px-[10px] py-[5px]" style={{ backgroundColor: '#FF5CA8' }}>
          <Text className="font-nunito-900 text-[11px] text-white">NEW</Text>
        </View>
      ) : (
        <Text className="text-[20px]" style={{ color: opened ? '#727074' : '#B0AEB2' }}>
          ›
        </Text>
      )}
    </View>
  );

  // Opened rows drop the cream card and the toy shadow — the design's way of saying "spent".
  if (opened) {
    return (
      <Pressable onPress={onPress} className="rounded-22 bg-surface">
        {body}
      </Pressable>
    );
  }
  return (
    <ToyShadow depth={4} shadowColor="#D9C7AF" backgroundColor="#FFF6E8" radius={22} onPress={onPress}>
      {body}
    </ToyShadow>
  );
}

/** Mint for a resolved name, otherwise the muted grey of whichever card it sits on. */
function rowSubtitleColor(flame: Flame, opened: boolean): string {
  if (flame.name && !flame.anonymous) return '#2E8F6E';
  return opened ? '#848286' : '#8B888D';
}

/* Empty state, per the design's note: no God Mode banner when there is nothing to unlock — the ask
   is voting, not paying. */
function FlamesEmpty({ onVote }: { onVote: () => void }) {
  return (
    <>
      <View className="mt-5">
        <EmptyState
          icon="aura"
          iconColor="#7C5CFF"
          title="No aura in here yet"
          body="People who pick you stay anonymous, so this fills up without warning. Voting puts you in more rounds."
          wobble
          ctaLabel="Vote in today's round"
          onCta={onVote}
        />
      </View>
      <View className="mt-4 gap-[9px]">
        <InfoCard icon="bell">
          We'll notify you the second someone picks you — a pick never says who until you scratch it.
        </InfoCard>
        <InfoCard icon="mail">
          More classmates at your school means more people who can pick you.
        </InfoCard>
      </View>
    </>
  );
}

function FlameDetail({ flame, bonusRevealsLeft, onClose }: { flame: Flame; bonusRevealsLeft: number; onClose: () => void }) {
  const revealFlame = useRevealFlame();
  const revealFlameName = useRevealFlameName();
  const shown = flame.revealed || flame.godMode;
  const genderLabel = flameGenderLabel(flame.gender);

  return (
    <Overlay onClose={onClose} style={{ borderTopWidth: 8, borderTopColor: flame.color }}>
      <Text className="text-3xl">{flame.emoji}</Text>
      <Text className="text-lg font-semibold">{flame.q}</Text>
      {flame.repeatAdmirer && <Text className="text-sm text-orange-600">✨ This person picked you {flame.pickCount}×</Text>}

      <View className="my-4 flex-row flex-wrap gap-y-1">
        {/* Omitted entirely when the voter chose "Rather not say" — printing "Rather not say" as
            their gender would hand out the one thing they declined to share. */}
        {genderLabel && <DetailRow label="Gender" value={genderLabel} />}
        {/* Both are withheld together when the sender's cohort is too small — see COHORT_FLOOR. */}
        {!flame.detailHidden && <DetailRow label="Grade" value={flame.grade} />}
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
