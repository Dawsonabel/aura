import { useState } from 'react';
import { Pressable, Share, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RoundChoice, RoundPoll } from '@aura/api-client';
import { useAuraRound } from '../../src/hooks/useAuraRound';
import { useMe } from '../../src/hooks/useMe';
import { usePublicProfile } from '../../src/hooks/useProfile';
import { useFollow, useUnfollow } from '../../src/hooks/useFollow';
import { AuthError } from '../../src/components/authKit';
import { ToyShadow } from '../../src/components/ToyShadow';
import { Wobble } from '../../src/components/Wobble';
import { AuraIcon } from '../../src/components/AuraIcon';
import { COIN_FILL } from '../../src/components/coin';
import { gradeShort } from '../../src/components/profileKit';
import { EmptyState, InlineFailure, SkeletonBlock } from '../../src/components/stateKit';
import {
  CountdownPill,
  CreamActionCard,
  PeekCard,
  PersonPlusButton,
  RerollShortSheet,
  RoundPips
} from '../../src/components/voteKit';
import { useRouter } from 'expo-router';

// Cycles pink -> mint -> purple -> yellow in grid order, per the design tokens' avatar rule.
const ACCENTS = [
  { bg: '#FF5CA8', shadow: '#C43A7C', ink: '#FFFFFF' },
  { bg: '#6BF2C2', shadow: '#3FBF95', ink: '#0A3B2C' },
  { bg: '#7C5CFF', shadow: '#5334D6', ink: '#FFFFFF' },
  { bg: '#FFD84D', shadow: '#D4AC17', ink: '#3A2A00' }
];

/* 14A retires the "✋ HOLD" chip once the gesture has had a fair chance to be learned. Counted against
   `me.roundsTotal` (rounds ever *completed*, tracked server-side) rather than a local flag, so a
   reinstall doesn't re-teach it to someone who has been playing for a month. */
const HOLD_HINT_ROUNDS = 3;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

const WORDS = ['none', 'one', 'two', 'three', 'four', 'five', 'six'];
function numberWord(n: number): string {
  return WORDS[n] ?? String(n);
}

export default function Aura() {
  const {
    mode,
    poll,
    choices,
    count,
    total,
    pick,
    reroll,
    advance,
    retry,
    playAgain,
    earned,
    shuffleUsed,
    roundsLeft,
    roundNumber,
    dailyLimit,
    nextRoundAt,
    rerollCost,
    rerollPending,
    rerollError,
    roundPayout,
    votesToday,
    followWeightFactor
  } = useAuraRound();
  const { data: me } = useMe();
  const router = useRouter();
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [peekId, setPeekId] = useState<string | null>(null);
  const [shortSheet, setShortSheet] = useState(false);
  // See AuthShell: the spec's flat "58px top" collides with the Dynamic Island on real hardware.
  const insets = useSafeAreaInsets();

  const coins = me?.coins ?? 0;
  const canAffordReroll = coins >= rerollCost;

  function handlePick(targetId: string) {
    if (pickedId) return;
    setPickedId(targetId);
    pick(targetId);
    // The design has no confirm step — tapping a candidate IS the vote, and the next question
    // slides in on its own. 300ms lets the avatar-flash read before advancing.
    setTimeout(() => {
      advance();
      setPickedId(null);
    }, 300);
  }

  /* 14A: "the button stays live and opens this sheet instead of dimming into silence — a disabled
     control teaches nothing". So being short of coins is a branch here, not a disabled prop. */
  function handleReroll() {
    if (canAffordReroll) reroll();
    else setShortSheet(true);
  }

  return (
    <View className="flex-1 bg-ground px-[21px]" style={{ paddingTop: insets.top + 14 }}>
      <StatusRow
        coins={coins}
        streak={me?.streak ?? 0}
        onPeople={() => router.push('/add')}
        onCoins={() => router.push('/shop')}
      />

      {/* 10A: loading, failed and empty are three different things. They all used to render the
          skeleton, which meant a round that never came back looked like one that was still coming. */}
      {mode === 'poll' && poll ? (
        <>
          <ProgressRow
            count={count}
            total={total}
            roundNumber={roundNumber}
            dailyLimit={dailyLimit}
          />
          <PromptCard poll={poll} />
          <CandidateGrid
            choices={choices}
            pickedId={pickedId}
            schoolName={me?.school?.name ?? null}
            showHoldHint={(me?.roundsTotal ?? 0) < HOLD_HINT_ROUNDS}
            onPick={handlePick}
            // Long-press, not tap: a tap here is an irreversible vote, so the profile can't share it.
            onPeek={setPeekId}
          />

          <Text className="font-nunito-800 mt-[11px] text-center text-[12.5px] text-ink-faint">
            Tap to pick. Hold to peek at a profile.
          </Text>

          <UtilityRow
            onReroll={handleReroll}
            onSkip={advance}
            locked={pickedId !== null}
            rerollCost={rerollCost}
            canAfford={canAffordReroll}
            rerollPending={rerollPending}
            rerollUsed={shuffleUsed}
          />
          {rerollError && <AuthError message={rerollError} />}
        </>
      ) : mode === 'congrats' ? (
        /* Every completed round used to land here and render the loading skeleton forever, because
           this screen had no branch for 'congrats' — a dead end at the end of all 12 questions. With
           rounds rationed it happens three times a day, so it needs a real surface. */
        <RoundDone
          earned={earned}
          roundsLeft={roundsLeft}
          godMode={!!me?.godMode}
          onNext={playAgain}
        />
      ) : mode === 'failed' ? (
        <View className="mt-[26px]">
          <InlineFailure
            icon="ballot"
            title="Today's round didn't load"
            body="Everything else works. This one just didn't come back."
            onRetry={retry}
          />
        </View>
      ) : mode === 'out' ? (
        <OutOfRounds
          dailyLimit={dailyLimit}
          votesToday={votesToday}
          followingCount={me?.following?.length ?? 0}
          followWeightFactor={followWeightFactor}
          nextRoundAt={nextRoundAt}
          onPeople={() => router.push('/add')}
          onAura={() => router.replace('/inbox')}
        />
      ) : mode === 'empty' ? (
        <View className="mt-[26px]">
          <EmptyState
            icon="clock"
            title="No round today"
            body={
              me?.school?.name
                ? `${me.school.name} has no questions set up yet, so there's nothing to vote on. Check back tomorrow.`
                : "There are no questions set up yet, so there's nothing to vote on. Check back tomorrow."
            }
            ctaLabel="Check again"
            onCta={retry}
            ctaTone="mint"
          />
        </View>
      ) : (
        <LoadingSkeleton />
      )}

      {/* Sheets last so they layer above everything, and are unmounted (not hidden) when closed —
          the peek card runs a profile query, which shouldn't fire until someone actually holds a card. */}
      {peekId && (
        <Peek
          userId={peekId}
          following={me?.following ?? []}
          onClose={() => setPeekId(null)}
          onOpenProfile={() => {
            const id = peekId;
            setPeekId(null);
            router.push({ pathname: '/u', params: { userId: id } });
          }}
        />
      )}

      <RerollShortSheet
        visible={shortSheet}
        cost={rerollCost}
        balance={coins}
        questionsLeft={Math.max(0, total - count + 1)}
        payout={roundPayout}
        onKeep={() => setShortSheet(false)}
        onBuy={() => {
          setShortSheet(false);
          router.push('/profile');
        }}
      />
    </View>
  );
}

/* The peek card's data, kept in its own component so the profile query mounts with the card and
   unmounts with it. Follow state comes from `me.following` — the same list the People screen reads, so
   following from a peek and following from the list can't disagree. */
function Peek({
  userId,
  following,
  onClose,
  onOpenProfile
}: {
  userId: string;
  following: string[];
  onClose: () => void;
  onOpenProfile: () => void;
}) {
  const { data: profile, isLoading } = usePublicProfile(userId);
  const follow = useFollow();
  const unfollow = useUnfollow();
  const isFollowing = following.includes(userId);

  return (
    <PeekCard
      profile={profile}
      loading={isLoading}
      isFollowing={isFollowing}
      followBusy={follow.isPending || unfollow.isPending}
      onToggleFollow={() => (isFollowing ? unfollow.mutate(userId) : follow.mutate(userId))}
      onOpenProfile={onOpenProfile}
      onClose={onClose}
    />
  );
}

function StatusRow({
  coins,
  streak,
  onPeople,
  onCoins
}: {
  coins: number;
  streak: number;
  onPeople: () => void;
  onCoins: () => void;
}) {
  return (
    <View className="flex-row items-center justify-between">
      {/* The AURA wordmark used to sit centred here. It came out when the Flames tab became the AURA
          tab: the word would then appear twice on one screen, once as the brand and once as the name
          of a different thing you can tap. The tab bar carries the name now. */}

      {/* Real streak: `me.streak` is derived server-side (streak.ts) and reads 0 the moment a day is
          missed. This used to be a hardcoded 12 — an invented number on the app's most-visited screen.
          At 0 the pill goes quiet rather than announcing a streak of nothing. */}
      {streak > 0 ? (
        <ToyShadow depth={3} shadowColor="#C4501E" backgroundColor="#FF7A3D" radius={9999}>
          <View className="flex-row items-center gap-[7px] px-[14px] py-[7px]">
            <AuraIcon name="flame" size={18} color="#FFFFFF" />
            <Text className="font-nunito-900 text-[15px] text-white">{streak}</Text>
            <Text className="font-nunito-800 text-[13px]" style={{ color: '#FFE0CE' }}>
              {streak === 1 ? 'day' : 'days'}
            </Text>
          </View>
        </ToyShadow>
      ) : (
        <View className="flex-row items-center gap-[7px] rounded-pill bg-surface px-[14px] py-[7px]">
          <AuraIcon name="flame" size={18} color="#848286" />
          <Text className="font-nunito-800 text-[13px] text-ink-dim">Start a streak</Text>
        </View>
      )}

      <View className="flex-row items-center gap-[9px]">
        {/* The balance is the natural door to the Shop — you tap the number you want more of. Keeps the
            Shop off the tab bar, which 14A already settled at four items. */}
        <Pressable
          onPress={onCoins}
          hitSlop={6}
          className="flex-row items-center gap-[7px] rounded-pill bg-surface px-[14px] py-[7px]"
        >
          <AuraIcon name="coin" size={18} color={COIN_FILL} />
          <Text className="font-nunito-900 text-[15px] text-white">{coins}</Text>
        </Pressable>
        {/* 14A's navigation call: People is not a fifth tab (five 78px items don't fit, and a tab would
            compete with voting for the session). This button is its primary entry point. */}
        <PersonPlusButton onPress={onPeople} />
      </View>
    </View>
  );
}

function ProgressRow({
  count,
  total,
  roundNumber,
  dailyLimit
}: {
  count: number;
  total: number;
  roundNumber: number;
  dailyLimit: number;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <>
      <View className="mt-[22px] flex-row items-center gap-[10px]">
        <RoundPips total={dailyLimit} current={roundNumber} />
        {/* The pips are the glance; the words are the answer. 14A: "Copy names the state in words so it
            never reads as fuel." */}
        {dailyLimit > 0 && (
          <Text className="font-nunito-800 text-[13px] text-ink-muted">
            Round {roundNumber} of {dailyLimit} today
          </Text>
        )}
        <View className="flex-1" />
        <Text className="font-nunito-800 text-[13px] text-ink-secondary">
          {count}/{total}
        </Text>
      </View>
      {/* Still the only bar on the screen — the rounds indicator is pips precisely so there aren't two. */}
      <View className="mt-2 h-[10px] overflow-hidden rounded-pill bg-surface">
        <View className="h-full rounded-pill bg-mint" style={{ width: `${pct}%` }} />
      </View>
    </>
  );
}

function PromptCard({ poll }: { poll: RoundPoll }) {
  return (
    <View className="mt-[22px] rounded-26 bg-surface p-5" style={{ position: 'relative' }}>
      <View
        className="rounded-pill bg-yellow px-3 py-[5px]"
        style={{ position: 'absolute', top: -14, left: 20, transform: [{ rotate: '-3deg' }] }}
      >
        <Text className="font-nunito-900 text-[12px]" style={{ color: '#3A2A00' }}>
          EVERYONE'S VOTING ON THIS
        </Text>
      </View>

      <Wobble>
        <Text style={{ fontSize: 40 }}>{poll.emoji}</Text>
      </Wobble>

      <Text className="font-fredoka-700 mt-2 text-[31px] leading-[33px] text-white">{poll.text}</Text>
      <Text className="font-nunito-700 mt-2 text-[13.5px] text-ink-muted">
        They'll know they got picked. Never that it was you.
      </Text>
    </View>
  );
}

function CandidateGrid({
  choices,
  pickedId,
  schoolName,
  showHoldHint,
  onPick,
  onPeek
}: {
  choices: RoundChoice[];
  pickedId: string | null;
  schoolName: string | null;
  showHoldHint: boolean;
  onPick: (targetId: string) => void;
  onPeek: (targetId: string) => void;
}) {
  const rows = [choices.slice(0, 2), choices.slice(2, 4)];

  return (
    <View className="mt-[18px] gap-3">
      {rows.map((row, i) => (
        <View key={i} className="flex-row gap-3">
          {row.map((c, j) => {
            const position = i * 2 + j;
            return (
              <CandidateCard
                key={c.id}
                choice={c}
                schoolName={schoolName}
                accent={ACCENTS[position % ACCENTS.length]}
                picked={c.id === pickedId}
                disabled={pickedId !== null}
                // On exactly one card, as in the design — a chip on all four is noise, not a hint.
                hold={showHoldHint && position === 1}
                onPress={() => onPick(c.id)}
                onLongPress={() => onPeek(c.id)}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}

function CandidateCard({
  choice,
  schoolName,
  accent,
  picked,
  disabled,
  hold,
  onPress,
  onLongPress
}: {
  choice: RoundChoice;
  schoolName: string | null;
  accent: { bg: string; shadow: string; ink: string };
  picked: boolean;
  disabled: boolean;
  hold: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const avatarAccent = picked ? { bg: '#FF5CA8', shadow: '#C43A7C', ink: '#FFFFFF' } : accent;
  /* Real now: grade comes from the server with the candidate (RoundChoice.grade), and the school is the
     viewer's own, since every candidate is by definition at it. This line used to read a hardcoded
     "11th · Lakeview" for everyone. Renders nothing rather than a placeholder when neither is known. */
  const meta = [gradeShort(choice.grade), schoolName].filter(Boolean).join(' · ');

  return (
    <View className="flex-1">
      <ToyShadow
        depth={5}
        shadowColor="#D9C7AF"
        backgroundColor="#FFF6E8"
        radius={24}
        onPress={onPress}
        onLongPress={onLongPress}
        disabled={disabled}
      >
        <View className="gap-[11px] px-[14px] py-4">
          {hold && (
            <View
              className="flex-row items-center gap-1 rounded-pill px-[9px] py-1"
              style={{ position: 'absolute', top: 12, right: 12, backgroundColor: '#EDE3D2', zIndex: 1 }}
            >
              <Text className="font-nunito-900 text-[10.5px]" style={{ color: '#8B888D' }}>
                ✋ HOLD
              </Text>
            </View>
          )}
          {/* self-start, or the avatar isn't round.

              ToyShadow's slab and face are plain Views, and this card is a flex *column*, so the default
              alignItems: stretch pulls them to the full card width — the inner 54×54 keeps its size but
              the coloured slab behind it becomes a full-width pill. Every other avatar in the app sits in
              a row (where stretch affects height, not width), which is why this is the only one that
              needed it, and why it went unnoticed until the grid first rendered with real candidates. */}
          <View className="self-start">
            <ToyShadow depth={3} shadowColor={avatarAccent.shadow} backgroundColor={avatarAccent.bg} radius={9999}>
              <View className="h-[54px] w-[54px] items-center justify-center">
                <Text className="font-fredoka-700 text-[21px]" style={{ color: avatarAccent.ink }}>
                  {initials(choice.name)}
                </Text>
              </View>
            </ToyShadow>
          </View>
          <View>
            <Text className="font-nunito-900 text-[17px]" style={{ color: '#2D2A2E' }} numberOfLines={1}>
              {choice.name}
            </Text>
            {meta.length > 0 && (
              <Text className="font-nunito-700 text-[13px]" style={{ color: '#8B888D' }} numberOfLines={1}>
                {meta}
              </Text>
            )}
          </View>
        </View>
      </ToyShadow>
    </View>
  );
}

/* The reroll button's four states, from 14A's state strip:
     affordable       — mint-ink price chip, toy shadow, tappable
     short            — dimmed, price chip goes pink, STILL tappable (opens the sheet)
     pending          — "Shuffling…", flat, no shadow
     already rerolled — flat and darker, one per question, no shadow

   `locked` (a vote is mid-flight) is separate from all four: it dims both buttons for 300ms and is
   never a state the user is meant to read. */
function UtilityRow({
  onReroll,
  onSkip,
  locked,
  rerollCost,
  canAfford,
  rerollPending,
  rerollUsed
}: {
  onReroll: () => void;
  onSkip: () => void;
  locked: boolean;
  rerollCost: number;
  canAfford: boolean;
  rerollPending: boolean;
  rerollUsed: boolean;
}) {
  const flat = rerollPending || rerollUsed;

  return (
    <View className="mt-3 flex-row gap-[10px]">
      {/* flex lives on the wrapper, not the ToyShadow: the shadow sizes itself to its content, so a
          flex on it would collapse the slab to the width of the label (same as AuthButton). */}
      <View style={{ flex: 1.35 }}>
        {flat ? (
          <View
            className="items-center rounded-pill py-[13px]"
            style={{ backgroundColor: rerollUsed ? '#332F35' : '#4E4B50' }}
          >
            <Text className="font-nunito-900 text-[14.5px]" style={{ color: rerollUsed ? '#6E6B70' : '#B3B1B4' }}>
              {rerollPending ? 'Shuffling…' : 'Already rerolled'}
            </Text>
          </View>
        ) : (
          <ToyShadow
            depth={4}
            shadowColor="#2E2C30"
            backgroundColor="#4E4B50"
            radius={9999}
            onPress={onReroll}
            disabled={locked}
            style={locked || !canAfford ? { opacity: 0.6 } : undefined}
          >
            <View className="flex-row items-center justify-center gap-2 py-[12px]">
              <AuraIcon name="reroll" size={17} color="#FFFFFF" />
              <Text className="font-nunito-900 text-[14.5px] text-white">New four</Text>
              <View className="flex-row items-center gap-1 rounded-pill px-[9px] py-[3px]" style={{ backgroundColor: '#645F67' }}>
                {/* Pink ink when you can't cover it: the price is the reason the tap will open a sheet
                    instead of new faces, so the price is what changes colour. */}
                <AuraIcon name="coin" size={13} color={canAfford ? COIN_FILL : '#FFC9E4'} />
                <Text className="font-nunito-900 text-[12.5px]" style={{ color: canAfford ? COIN_FILL : '#FFC9E4' }}>
                  {rerollCost}
                </Text>
              </View>
            </View>
          </ToyShadow>
        )}
      </View>

      <View style={{ flex: 1 }}>
        <ToyShadow
          depth={4}
          shadowColor="#2E2C30"
          backgroundColor="#4E4B50"
          radius={9999}
          onPress={onSkip}
          disabled={locked}
          style={locked ? { opacity: 0.6 } : undefined}
        >
          <View className="flex-row items-center justify-center gap-[7px] py-[13px]">
            <Text className="font-nunito-800 text-[15px]" style={{ color: '#D6D5D6' }}>
              Skip
            </Text>
            <AuraIcon name="skip" size={16} color="#D6D5D6" />
          </View>
        </ToyShadow>
      </View>
    </View>
  );
}

/* Round finished. Deliberately short: the reward is the aura it just sent, and the next round is one
   tap away. When the allowance is spent, "Done for today" re-queries and the server answers with the
   out-of-rounds state, so that screen isn't duplicated here. */
function RoundDone({
  earned,
  roundsLeft,
  godMode,
  onNext
}: {
  earned: number;
  roundsLeft: number;
  godMode: boolean;
  onNext: () => void;
}) {
  const more = roundsLeft > 0;
  return (
    <View className="mt-[26px]">
      <EmptyState
        icon="check"
        iconColor="#3FBF95"
        title="Round done"
        body={
          `You earned ${earned} ${earned === 1 ? 'coin' : 'coins'}${godMode ? ' at the God Mode rate' : ''}. ` +
          (more
            ? `${roundsLeft} more ${roundsLeft === 1 ? 'round' : 'rounds'} today.`
            : "That's your last one today.")
        }
        ctaLabel={more ? 'Next round' : 'Done for today'}
        onCta={onNext}
        ctaTone="mint"
      />
    </View>
  );
}

/* 14A screen 3. Not 10A's generic empty state, on purpose: running out of rounds is the designed end of
   a session rather than a shortage of content, so it gets the purple "see you at midnight" tag, the
   day's real vote count, a live countdown to the refill, and the two moves that actually change
   tomorrow's four. The aura line gives the session somewhere to go instead of ending it. */
function OutOfRounds({
  dailyLimit,
  votesToday,
  followingCount,
  followWeightFactor,
  nextRoundAt,
  onPeople,
  onAura
}: {
  dailyLimit: number;
  votesToday: number;
  followingCount: number;
  followWeightFactor: number;
  nextRoundAt: string | null;
  onPeople: () => void;
  onAura: () => void;
}) {
  async function invite() {
    try {
      await Share.share({ message: 'come vote on Aura — anonymous, our school only 🔥' });
    } catch {
      // Dismissing the share sheet throws on some platforms; nothing to report.
    }
  }

  return (
    <>
      <View className="mt-[22px] flex-row items-center gap-[10px]">
        <RoundPips total={dailyLimit} current={dailyLimit + 1} />
        <Text className="font-nunito-800 text-[13px] text-ink-muted">
          All {dailyLimit} {dailyLimit === 1 ? 'round' : 'rounds'} played
        </Text>
      </View>

      <View className="mt-[30px] rounded-30 bg-surface px-[22px] py-6" style={{ position: 'relative' }}>
        <View style={{ position: 'absolute', top: -14, left: 22, transform: [{ rotate: '-3deg' }] }}>
          <ToyShadow depth={3} shadowColor="#5334D6" backgroundColor="#7C5CFF" radius={9999}>
            <View className="px-3 py-[5px]">
              <Text className="font-nunito-900 text-[12px] text-white">SEE YOU AT MIDNIGHT</Text>
            </View>
          </ToyShadow>
        </View>

        <Text className="font-fredoka-700 mt-2 text-[34px] leading-[36px] text-white">
          That's your {numberWord(dailyLimit)}.
        </Text>
        <Text className="font-nunito-700 mt-[10px] text-[14.5px] leading-[22px] text-ink-secondary">
          {votesToday > 0
            ? `${votesToday} ${votesToday === 1 ? 'vote' : 'votes'} cast today. Somebody's inbox is lighting up right now and they'll never know it was you.`
            : "You skipped every question today, so nobody got aura from you. Tomorrow's four are waiting."}
        </Text>

        <CountdownPill untilIso={nextRoundAt} trailing={`until ${dailyLimit} more`} />
      </View>

      <Text className="font-nunito-900 mt-4 text-[12.5px] text-ink-muted">MAKE TOMORROW BETTER</Text>

      <View className="mt-[11px] gap-[10px]">
        <CreamActionCard
          icon="eye"
          iconBackground="#6BF2C2"
          iconShadow="#3FBF95"
          iconColor="#0A3B2C"
          title="Follow more people"
          body={
            /* Both numbers are real: the follow count is yours, and the multiplier is the server's own
               candidate weight (PollRound.followWeightFactor), not a figure typed in here. */
            `You follow ${followingCount}. Following someone makes them ${followWeightFactor}× likelier to show up in your four.`
          }
          onPress={onPeople}
        />
        <CreamActionCard
          icon="mail"
          iconBackground="#FFD84D"
          iconShadow="#D4AC17"
          iconColor="#3A2A00"
          title="Invite your class"
          body="Every person who joins puts you in more people's polls."
          onPress={invite}
        />
      </View>

      <Pressable onPress={onAura} hitSlop={8} className="mt-[14px] flex-row items-center justify-center gap-[6px]">
        <Text className="font-nunito-800 text-[13px] text-ink-faint">Check your aura while you wait</Text>
        <AuraIcon name="arrowRight" size={14} color="#727074" />
      </Pressable>
    </>
  );
}

// "Never a spinner over the whole screen" — candidate cards pulse as cream blocks instead.
/* 10A's skeleton rules applied to this screen's real layout: #2E2C2F blocks at the true heights and
   radii of the prompt card and the 2×2 candidate grid, shimmering rather than sitting static, with a
   90ms stagger across the grid. Replaces the earlier flat cream-at-35% blocks. */
function LoadingSkeleton() {
  return (
    <View className="mt-[26px] gap-3">
      <SkeletonBlock height={188} radius={26} />
      <View className="mt-[18px] gap-3">
        <View className="flex-row gap-3">
          <View className="flex-1">
            <SkeletonBlock height={130} radius={24} index={0} />
          </View>
          <View className="flex-1">
            <SkeletonBlock height={130} radius={24} index={1} />
          </View>
        </View>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <SkeletonBlock height={130} radius={24} index={2} />
          </View>
          <View className="flex-1">
            <SkeletonBlock height={130} radius={24} index={3} />
          </View>
        </View>
      </View>
    </View>
  );
}
