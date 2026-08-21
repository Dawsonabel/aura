import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { FriendState, RoundChoice, RoundPoll } from '@aura/api-client';
import { useAuraRound } from '../../src/hooks/useAuraRound';
import { useMe } from '../../src/hooks/useMe';
import { useSchoolmates } from '../../src/hooks/useSchoolmates';
import { usePublicProfile } from '../../src/hooks/useProfile';
import { useAcceptFriendRequest, useCancelFriendRequest, useRemoveFriend, useSendFriendRequest } from '../../src/hooks/useFriends';
import { AuthError } from '../../src/components/authKit';
import { ToyShadow } from '../../src/components/ToyShadow';
import { Wobble } from '../../src/components/Wobble';
import { AuraIcon } from '../../src/components/AuraIcon';
import { SPARK_FILL } from '../../src/components/currency';
import { EmptyState, InlineFailure, SkeletonBlock } from '../../src/components/stateKit';
import { CandidateSheet, CountdownPill, CreamActionCard, RerollShortSheet } from '../../src/components/voteKit';
import { useRouter } from 'expo-router';

/* The pink/mint/purple/yellow ACCENTS rotation lived here to colour the four candidate avatars. The
   avatars are gone from the ballot, and nothing else on this screen cycled by grid position, so the
   table went with them — the accents themselves still exist wherever avatars remain (the candidate
   sheet, profiles, the People screen). */

/* `numberWord` lived here, spelling the daily allowance for "That's your three." There is one round an
   hour now, so that line is "That's your round." and there is no number to spell. */

/* One "+N ⚡" that appears where a vote landed, then leaves.

   Placed at a random point rather than a fixed one because it fires on every question of every round —
   a reward that always animates from the same spot stops being noticed by the third one. Kept away from
   the screen edges and off the very top, where the counter it feeds already sits.

   ~2s end to end: a fast fade in, a beat to be read, a slow fade out while it drifts up. The drift is
   what makes it read as something leaving rather than something blinking. */
type SparkPop = { id: number; left: number; top: number };

function SparkPopLabel({ pop, onDone }: { pop: SparkPop; onDone: (id: number) => void }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(progress, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.delay(900),
      Animated.timing(progress, { toValue: 2, duration: 800, useNativeDriver: true })
    ]).start(({ finished }) => {
      // Only retire it on a real finish: an interrupted animation means the screen is going away.
      if (finished) onDone(pop.id);
    });
  }, [progress, pop.id, onDone]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: `${pop.left}%`,
        top: `${pop.top}%`,
        /* Above the round, not behind it. Siblings paint in source order in RN, and this renders before
           the ScrollView — without a zIndex the opaque prompt card and candidate cards draw straight
           over it, which is exactly where the random position tends to put it. */
        zIndex: 6,
        opacity: progress.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] }),
        transform: [
          { translateY: progress.interpolate({ inputRange: [0, 1, 2], outputRange: [10, 0, -34] }) },
          { scale: progress.interpolate({ inputRange: [0, 1, 2], outputRange: [0.7, 1, 1] }) }
        ]
      }}
    >
      {/* The glyph alone — no "+1". The number was saying what the counter in the corner already says
          a beat later, and the bolt on its own is the thing that reads at a glance mid-vote. */}
      <AuraIcon name="bolt" size={44} color={SPARK_FILL} />
    </Animated.View>
  );
}

/* The running total, pinned over the round rather than in it.

   Overlaid and semi-transparent on purpose: it has to be readable on every question without competing
   with the prompt or the four faces, and it is the thing the pops above are counting into — so it can't
   scroll away with the content. It sits above the ScrollView for that reason, not inside it. */
function SparkCounter({ total, top }: { total: number; top: number }) {
  return (
    <View
      pointerEvents="none"
      className="flex-row items-center gap-[6px] rounded-pill px-[13px] py-[7px]"
      style={{ position: 'absolute', right: 21, top, backgroundColor: 'rgba(64,62,65,0.72)', zIndex: 5 }}
    >
      <AuraIcon name="bolt" size={22} color={SPARK_FILL} />
      <Text className="font-nunito-900 text-[19px]" style={{ color: SPARK_FILL }}>
        {total}
      </Text>
    </View>
  );
}

export default function Aura() {
  const {
    mode,
    poll,
    choices,
    pick,
    reroll,
    advance,
    retry,
    playAgain,
    earned,
    roundsLeft,
    nextRoundAt,
    rerollCost,
    rerollPending,
    rerollError,
    votePayout,
    roundPayout,
    votesToday,
    followWeightFactor
  } = useAuraRound();
  const { data: me } = useMe();
  /* Where you stand with each candidate, for the sheet's friend button. Read from the schoolmates list
     rather than the profile query because that's where `friendState` already lives — and the People
     screen reads the same cache, so the two screens can't disagree about whether you've asked someone. */
  const { data: schoolmates } = useSchoolmates();
  const friendStateFor = (id: string | null): FriendState =>
    schoolmates?.find(s => s.id === id)?.friendState ?? 'none';
  const router = useRouter();
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [shortSheet, setShortSheet] = useState(false);
  /* Live "+N" labels. A list rather than one slot because votes land faster than the 2s each label
     lives — a single slot would cut the previous one off mid-fade on a fast round. The id is a plain
     counter, not Date.now(), so two votes in the same millisecond can't collide on a React key. */
  const [pops, setPops] = useState<SparkPop[]>([]);
  const nextPopId = useRef(0);
  // See AuthShell: the spec's flat "58px top" collides with the Dynamic Island on real hardware.
  const insets = useSafeAreaInsets();

  const coins = me?.coins ?? 0;
  const canAffordReroll = coins >= rerollCost;

  /* Called from the candidate sheet's Vote button, never from the grid.

     The design had no confirm step — a tap on a card *was* the vote — and the profile could only be
     reached by long-pressing, precisely so the gesture that opened it couldn't also cast a ballot.
     That's inverted now: the tap opens the card and the vote is a button inside it. It costs a second
     tap on each of the twelve questions, and buys back the thing the old model had no answer for —
     a mis-tap used to be an irreversible anonymous vote for the wrong person, with nothing between the
     finger and the ballot. */
  function handleVote(targetId: string) {
    if (pickedId) return;
    setPickedId(targetId);
    pick(targetId);
    /* Fired here rather than off the mutation's success, and the counter beside it is not waiting on
       the refetch either. The vote is already guarded — `pickedId` blocks a second one, and a question
       already answered comes back as a no-op — so the pay is a foregone conclusion by this point, and
       an animation that waits on a round trip lands after the next question has already slid in.
       `votePayout` is the served number, so this can't drift from what actually gets credited. */
    if (votePayout > 0) {
      setPops(current => [
        ...current,
        {
          id: nextPopId.current++,
          // Inset from the edges, and clear of the counter's corner.
          left: 12 + Math.random() * 58,
          top: 26 + Math.random() * 38
        }
      ]);
    }
    // 300ms lets the avatar-flash read before the next question slides in.
    setTimeout(() => {
      advance();
      setPickedId(null);
    }, 300);
  }

  const dropPop = (id: number) => setPops(current => current.filter(p => p.id !== id));

  /* 14A: "the button stays live and opens this sheet instead of dimming into silence — a disabled
     control teaches nothing". So being short of coins is a branch here, not a disabled prop. */
  function handleReroll() {
    if (canAffordReroll) reroll();
    else setShortSheet(true);
  }

  return (
    <View className="flex-1 bg-ground px-[21px]" style={{ paddingTop: insets.top + 14 }}>
      {/* Both of these sit outside the ScrollView so they hold their place while the round moves under
          them — the counter would otherwise scroll off exactly when a pop is animating into it. Only
          during a round: on the congrats and out-of-rounds screens there is nothing being earned, and a
          floating balance there is just furniture. */}
      {mode === 'poll' && (
        <>
          <SparkCounter total={coins} top={insets.top + 14} />
          {pops.map(p => (
            <SparkPopLabel key={p.id} pop={p} onDone={dropPop} />
          ))}
        </>
      )}
      {/* Everything on this screen scrolls.

          This screen was the one fixed-height surface in the app, on the assumption that a round fits
          a phone. It doesn't always: a three-line prompt pushes the reroll row under the tab bar and
          there was no way to reach it — no scroll to try, since the content sat in a plain View that
          simply clipped. */}
      {/* `flexGrow: 1` so a round that doesn't fill the screen still stretches to it — the prompt card
          takes the slack (see PromptCard's flex-1 below) instead of leaving a dead band above the tab
          bar. It's flexGrow, not flex, so a long prompt still overflows into a real scroll rather than
          being squeezed: content is *at least* one screen tall, never capped at it. */}
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 10 }}
      >
        {/* 10A: loading, failed and empty are three different things. They all used to render the
            skeleton, which meant a round that never came back looked like one that was still coming. */}
        {mode === 'poll' && poll ? (
          <View className="flex-1">
            <PromptCard poll={poll} />
            {/* No "tap someone to see their card" hint under the grid. Four tappable faces under a
                question is self-evident, and the line was competing with the thing it described. */}
            <CandidateGrid choices={choices} pickedId={pickedId} onOpen={setOpenId} />

            <UtilityRow
              onReroll={handleReroll}
              locked={pickedId !== null}
              rerollCost={rerollCost}
              rerollPending={rerollPending}
            />
            {rerollError && <AuthError message={rerollError} />}
          </View>
        ) : mode === 'congrats' ? (
          /* Every completed round used to land here and render the loading skeleton forever, because
             this screen had no branch for 'congrats' — a dead end at the end of all 12 questions. With
             rounds rationed it happens three times a day, so it needs a real surface. */
          <RoundDone
            earned={earned}
            roundsLeft={roundsLeft}
            infiniteAura={!!me?.infiniteAura}
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
            votesToday={votesToday}
            followingCount={me?.friends?.length ?? 0}
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
      </ScrollView>

      {/* Sheets last so they layer above everything, and are unmounted (not hidden) when closed —
          the sheet runs a profile query, which shouldn't fire until someone actually opens a card. */}
      {openId && (
        <CandidateSheetData
          userId={openId}
          friendState={friendStateFor(openId)}
          onClose={() => setOpenId(null)}
          onVote={() => {
            const id = openId;
            setOpenId(null);
            handleVote(id);
          }}
          onOpenProfile={() => {
            const id = openId;
            setOpenId(null);
            router.push({ pathname: '/u', params: { userId: id } });
          }}
        />
      )}

      <RerollShortSheet
        visible={shortSheet}
        cost={rerollCost}
        balance={coins}
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

/* The sheet's data, kept in its own component so the profile query mounts with the card and unmounts
   with it. `friendState` is passed in from the schoolmates list — the same value the People screen
   reads, so adding someone from here and adding them from the list can't disagree about which of the
   five states they're in. */
function CandidateSheetData({
  userId,
  friendState,
  onClose,
  onVote,
  onOpenProfile
}: {
  userId: string;
  friendState: FriendState;
  onClose: () => void;
  onVote: () => void;
  onOpenProfile: () => void;
}) {
  const { data: profile, isLoading } = usePublicProfile(userId);
  const send = useSendFriendRequest();
  const cancel = useCancelFriendRequest();
  const accept = useAcceptFriendRequest();
  const removeFriend = useRemoveFriend();
  const busy = send.isPending || cancel.isPending || accept.isPending || removeFriend.isPending;

  function act() {
    if (friendState === 'friends') return removeFriend.mutate(userId);
    if (friendState === 'sent') return cancel.mutate(userId);
    if (friendState === 'received') return accept.mutate(userId);
    return send.mutate(userId);
  }

  return (
    <CandidateSheet
      profile={profile}
      loading={isLoading}
      friendState={friendState}
      friendBusy={busy}
      onFriendAction={act}
      onVote={onVote}
      onOpenProfile={onOpenProfile}
      onClose={onClose}
    />
  );
}

/* `ProgressRow` lived here — ten notches and a "3/10" for the questions answered so far.

   It's gone, and not for layout reasons. A visible end makes the round a task with a finish line: you
   see two notches left and you're playing to be done rather than because the next question is worth
   answering. Without it the round just keeps handing you people until it doesn't, which is the same
   ten questions and a completely different feeling.

   What's left to say "you're partway through something" is nothing at all, deliberately. The round
   ends when it ends, and the out-of-rounds screen is where the count belongs — after the fact, where
   it reads as what you did rather than as what's left. */

/* The question, centred, and nothing else on the card.

   Two things came off it. The "EVERYONE'S VOTING ON THIS" banner was decoration asserting something
   the screen already makes obvious — it's the only question on screen and there's a progress bar
   above it — and it was the one element breaking the card's rectangle, which cost it presence. The
   "They'll know they got picked. Never that it was you." line explained the anonymity rule on every
   single question, twelve times a round; onboarding says it once, which is where a rule belongs.

   Bigger and centred because this is the thing being answered. `minHeight` rather than fixed height:
   a one-line prompt still gets a substantial card instead of a thin strip, and a three-line one grows
   past it — the enclosing ScrollView is what catches the overflow. */
function PromptCard({ poll }: { poll: RoundPoll }) {
  return (
    /* No top margin: with the progress row removed this is the first thing on the screen, and a margin
       stacked on the container's safe-area padding would open the dead band the row used to fill. */
    <View className="flex-1 items-center justify-center rounded-26 bg-surface px-6 py-7" style={{ minHeight: 210 }}>
      <Wobble>
        <Text style={{ fontSize: 62 }}>{poll.emoji}</Text>
      </Wobble>

      {/* Bigger with the progress row's space. This is the thing being answered, and it now has the
          top of the screen to itself. */}
      <Text className="font-fredoka-700 mt-3 text-center text-[36px] leading-[40px] text-white">{poll.text}</Text>
    </View>
  );
}

function CandidateGrid({
  choices,
  pickedId,
  onOpen
}: {
  choices: RoundChoice[];
  pickedId: string | null;
  onOpen: (targetId: string) => void;
}) {
  const rows = [choices.slice(0, 2), choices.slice(2, 4)];

  return (
    <View className="mt-[18px] gap-3">
      {rows.map((row, i) => (
        <View key={i} className="flex-row gap-3">
          {row.map((c, j) => (
            <CandidateCard
              key={c.id}
              choice={c}
              picked={c.id === pickedId}
              disabled={pickedId !== null}
              onPress={() => onOpen(c.id)}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

function CandidateCard({
  choice,
  picked,
  disabled,
  onPress
}: {
  choice: RoundChoice;
  picked: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  /* Just the name, centred.

     The avatar came off the ballot entirely — it's on the candidate sheet, which is where you land the
     moment you tap. On the grid it was a 44px disc of pure decoration competing with the one word that
     actually identifies the person, and four of them made the grid read as a colour swatch chart.

     Long names wrap to a second line and stack — "Kai Robinson" breaks at the space into first name
     over last. Two lines is the cap; a third would start pushing the grid around mid-round.

     `picked` moved from the avatar onto the whole card. It's the 300ms flash between casting a vote in
     the sheet and the next question sliding in — the only confirmation that the tap landed on the
     person you meant — and with the avatar gone it had nothing left to colour. */
  return (
    <View className="flex-1">
      <ToyShadow
        depth={5}
        shadowColor={picked ? '#C43A7C' : '#D9C7AF'}
        backgroundColor={picked ? '#FF5CA8' : '#FFF6E8'}
        radius={24}
        onPress={onPress}
        disabled={disabled}
      >
        {/* minHeight, because the card has no avatar to give it size any more — without it the four
            cards would collapse to two lines of text and the grid would lose its shape. */}
        <View className="items-center justify-center px-[14px] py-[24px]" style={{ minHeight: 132 }}>
          <Text
            className="font-fredoka-700 text-center text-[27px]"
            numberOfLines={2}
            style={{ color: picked ? '#FFFFFF' : '#2D2A2E', lineHeight: 31 }}
          >
            {choice.name}
          </Text>
        </View>
      </ToyShadow>
    </View>
  );
}

/* Re-roll sits the same distance from the grid above it as it does from the tab bar below.

   Below is not this component's to set: the scroll view's own bottom padding (10) plus the tab bar
   container's top padding (12, in `(app)/_layout.tsx`) already come to 22. So this is 22, and the two
   gaps match. Anything that changes either of those two numbers has to change this one. */
const REROLL_GAP = 22;

/* The reroll button's four states, from 14A's state strip:
     affordable       — mint-ink price chip, toy shadow, tappable
     short            — dimmed, price chip goes pink, STILL tappable (opens the sheet)
     pending          — "Shuffling…", flat, no shadow
     already rerolled — flat and darker, one per question, no shadow

   `locked` (a vote is mid-flight) is separate from all four: it dims the button for 300ms and is
   never a state the user is meant to read. */
function UtilityRow({
  onReroll,
  locked,
  rerollCost,
  rerollPending,
}: {
  onReroll: () => void;
  locked: boolean;
  rerollCost: number;
  rerollPending: boolean;
}) {
  /* Only "Shuffling…" now. There is no "already rerolled" state — rerolls are unlimited, so the
     button never retires; the price is the only thing that stops you. */
  const flat = rerollPending;

  /* Full width, under the whole grid.

     Skip used to sit beside it, splitting this row 1:1 so the seam lined up with the gap between the
     two columns of cards. Skip is gone — the round advances on a vote, and a button whose only job was
     to not answer was giving equal billing to doing nothing. Re-roll now takes the width the pair had,
     which also makes it a much bigger target than half a row. */
  return (
    /* Centred at 80% of the row rather than edge to edge. Full width made it the widest thing on the
       screen — wider than the candidate cards it's subordinate to — which read as the primary action
       when the primary action is picking someone. Narrower keeps it an obvious target without
       out-ranking the grid. Both states take the same width, or the button would resize mid-shuffle. */
    <View style={{ marginTop: REROLL_GAP, alignItems: 'center' }}>
      {flat ? (
        <View
          className="items-center rounded-pill py-[18px]"
          style={{ width: '80%', backgroundColor: '#4E4B50' }}
        >
          <Text className="font-fredoka-700 text-[19px]" style={{ color: '#B3B1B4' }}>
            Shuffling…
          </Text>
        </View>
      ) : (
        /* Width goes on a wrapper, not on ToyShadow's `style` — that prop lands on the inner face, so
           sizing through it would leave a full-width shadow slab under an 80% button. */
        <View style={{ width: '80%' }}>
        <ToyShadow
          depth={4}
          shadowColor="#2E2C30"
          backgroundColor="#4E4B50"
          radius={9999}
          onPress={onReroll}
          disabled={locked}
          /* Dimmed only while a vote is in flight. Not for affordability — see the price chip below. */
          style={locked ? { opacity: 0.6 } : undefined}
        >
          {/* Centred as one group, with a fixed gap before the price.

              This was briefly justified apart — dice and label hard left, price hard right — on the
              theory that a button should read like a shelf label. It doesn't work at this width: the
              pill is 80% of the row, so a greedy spacer strands the price against the far edge with a
              band of nothing in the middle, and the two halves stop looking like one control. The gap
              is a fixed 18pt instead, which is enough to keep the price from reading as part of the
              label ("Re-Roll 5") without letting it drift off on its own. */}
          <View className="flex-row items-center justify-center px-[20px] py-[14px]">
            {/* The dice, not the circular-arrow `reroll` glyph: this swaps four people for four other
                people, which is a roll rather than a retry. Same icon the Shop's random boost uses. */}
            <AuraIcon name="dice" size={27} color="#FFFFFF" />
            <Text className="font-fredoka-700 ml-[12px] text-[21px] text-white">Re-Roll</Text>
            <View style={{ width: 18 }} />
            {/* The price: a yellow bolt and a white number, and nothing else.

                It briefly carried the balance too and turned pink when you couldn't cover it. Both are
                gone: the balance lives in the counter pinned top-right, where it's visible on every
                question rather than only next to this button, and colouring the price pink pre-judged
                a tap that still does something useful — being short opens the sheet that explains the
                shortfall. A button that looks broken teaches less than one that answers.

                The bolt is SPARK_FILL rather than white so the currency is one colour everywhere it
                appears — the counter above, the Shop, and here. A white bolt read as a generic glyph
                on a grey pill; yellow makes the price and the balance visibly the same unit. The
                *number* stays white, because pricing the reroll in the currency's own colour would
                make the pill look like a balance rather than a cost. */}
            <View className="flex-row items-center gap-[5px] rounded-pill px-[11px] py-[5px]" style={{ backgroundColor: '#645F67' }}>
              <AuraIcon name="bolt" size={16} color={SPARK_FILL} />
              <Text className="font-nunito-900 text-[15.5px] text-white">{rerollCost}</Text>
            </View>
          </View>
        </ToyShadow>
        </View>
      )}
    </View>
  );
}

/* Round finished. Deliberately short: the reward is the aura it just sent, and the next round is one
   tap away. When the allowance is spent, "Done for today" re-queries and the server answers with the
   out-of-rounds state, so that screen isn't duplicated here. */
function RoundDone({
  earned,
  roundsLeft,
  infiniteAura,
  onNext
}: {
  earned: number;
  roundsLeft: number;
  infiniteAura: boolean;
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
          /* No noun. The currency's glyph is a bolt and it has no agreed name yet, so this counts
             without naming — and the old "at the Infinite Aura rate" is gone twice over: the product is
             called Infinite Aura, and its rate is deliberately level with everyone else's. */
          `You earned ${earned} this round. ` +
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
   a session rather than a shortage of content, so it gets the purple tag, the day's real vote count, a
   live countdown to the refill, and the two moves that actually change your next four. The aura line
   gives the session somewhere to go instead of ending it.

   The wait is an hour now rather than until midnight, which changes what this screen is for: it used
   to be a goodbye and is now a short interval, so the copy points at the clock rather than at
   tomorrow. */
function OutOfRounds({
  votesToday,
  followingCount,
  followWeightFactor,
  nextRoundAt,
  onPeople,
  onAura
}: {
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
      {/* No notches here either. They were the finished state of a progress bar the round no longer
          shows, so they referred to something you never saw. */}

      <View className="mt-[30px] rounded-30 bg-surface px-[22px] py-6" style={{ position: 'relative' }}>
        <View style={{ position: 'absolute', top: -14, left: 22, transform: [{ rotate: '-3deg' }] }}>
          <ToyShadow depth={3} shadowColor="#5334D6" backgroundColor="#7C5CFF" radius={9999}>
            <View className="px-3 py-[5px]">
              <Text className="font-nunito-900 text-[12px] text-white">BACK ON THE HOUR</Text>
            </View>
          </ToyShadow>
        </View>

        <Text className="font-fredoka-700 mt-2 text-[34px] leading-[36px] text-white">That's your round.</Text>
        <Text className="font-nunito-700 mt-[10px] text-[14.5px] leading-[22px] text-ink-secondary">
          {votesToday > 0
            ? `${votesToday} ${votesToday === 1 ? 'vote' : 'votes'} cast today. Somebody's inbox is lighting up right now and they'll never know it was you.`
            : 'You answered none of them, so nobody got aura from you. The next ten are close.'}
        </Text>

        <CountdownPill untilIso={nextRoundAt} trailing="until the next round" />
      </View>

      <Text className="font-nunito-900 mt-4 text-[12.5px] text-ink-muted">MAKE THE NEXT ONE BETTER</Text>

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
