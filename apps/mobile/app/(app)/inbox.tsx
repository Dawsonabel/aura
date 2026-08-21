import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Share, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@clerk/expo';
import type { Aura } from '@aura/api-client';
import { useAuras } from '../../src/hooks/useAuras';
import { useMe } from '../../src/hooks/useMe';
import { useMarkAurasRead } from '../../src/hooks/useMarkAurasRead';
import { useMarkAuraOpened } from '../../src/hooks/useMarkAuraOpened';
import { useNotifications, type Notification } from '../../src/hooks/useNotifications';
import { useFriendActivity, type FriendActivityEvent } from '../../src/hooks/useFriendActivity';
import { useMarkNotificationsRead } from '../../src/hooks/useMarkNotificationsRead';
import { useRevealAuraName } from '../../src/hooks/useRevealAuraName';
import { AuraIcon } from '../../src/components/AuraIcon';
import { EmptyState, InlineFailure, SkeletonBlock, SkeletonRows } from '../../src/components/stateKit';
import { InfoCard } from '../../src/components/settingsKit';
import { ToyShadow } from '../../src/components/ToyShadow';
import { StatusRow } from '../../src/components/voteKit';
import { AuthError } from '../../src/components/authKit';
import {
  AuraCardFace,
  EmptyCardSlot,
  GENDER_ACCENT,
  PAGER_TAIL,
  PagerRow,
  PeriodBar,
  ReceiptPaper,
  SegmentBar,
  TRACK,
  UNKNOWN_ACCENT,
  roamSlots,
  useRoamClock,
  type CardRoam,
  type Segment
} from '../../src/components/auraKit';
import {
  PERIODS,
  activityFeed,
  allGendersWithheld,
  auraLine,
  periodDelta,
  periodSpec,
  pickedYouPhrase,
  receiptCloser,
  receiptLines,
  receiptShareText,
  relativeTime,
  splitOf,
  timeToReset,
  withinDays,
  type ActivityItem,
  type Period
} from '../../src/lib/auraTab';

/* The Aura tab — three segments over one query.

   Activity is you, by day. Cards is the grid you spend flips on. Receipt is the thing you post. They
   share a header and a data source (`useAuras`), which is the whole reason they're segments of one
   tab rather than three destinations: every one of them is an answer to "who picked me", and the
   navigation between them shouldn't cost a screen transition.

   What the aura list carries — and doesn't — decides most of what's below. Gender is free on every
   card, so the filter, the split bar and the card faces are real. The name and grade arrive together
   and only on a flip, which is why the receipt itemises by superlative rather than by gender × grade:
   on most cards there is no grade to itemise. A flip is the only way to open a card, and Infinite Aura
   is the only way to flip. */

const PAGE_SIZE = 4;

/* The Receipt segment's one spacing value, used twice: paper → period switch → Share. The switch sits
   exactly between the object and the button because it belongs to neither, and one constant is what
   keeps that true when either neighbour changes size. */
const RECEIPT_GAP = 16;

/* The streak · coins · add-friends row, parked rather than removed.

   It came here off the Vote tab because standing account state was crowding the ballot, and it may
   well come back — but while this tab is being designed it competes with the header, the segment bar
   and the pill for the same band of screen, and none of the three segments below is about coins. Flip
   to true to restore it; the row and its wiring are otherwise untouched. */
const STATUS_ROW = false;

export default function Inbox() {
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useAuras();
  const markAurasRead = useMarkAurasRead();
  const { data: notifications } = useNotifications();
  const { data: friendEvents } = useFriendActivity();
  const markNotificationsRead = useMarkNotificationsRead();

  /* The active segment lives in the URL, not in state.

     `(app)` renders a `<Slot />`, so opening a card unmounts this screen outright — component state
     would come back as the default and drop you back on the first segment every time you closed a
     reveal. The segment is part of where you are, and the URL is what survives a round trip through
     the router, so that's where it goes. Deep-linking straight to /inbox?seg=receipt falls out of it.

     Activity is the default, matching its place at the head of SEGMENTS. Cards held this for a while
     on the argument that it's the reason to open the tab — but that's an argument about what you came
     for, not about what should meet you. The feed is the thing that changes between visits, so it's
     what makes opening the tab worth doing twice; the grid is one tap away and isn't going anywhere. */
  const { seg } = useLocalSearchParams<{ seg?: string }>();
  const segment: Segment = seg === 'cards' || seg === 'receipt' ? seg : 'activity';
  // setParams, not push: switching segments is not a place you should have to press back out of.
  const setSegment = (s: Segment) => router.setParams({ seg: s });

  // Freezes the unread list the moment `notifications` first loads, so marking them read below
  // (which invalidates and refetches the query) doesn't make them disappear out from under the user.
  // Computed during render — see https://react.dev/learn/you-might-not-need-an-effect — rather than
  // in an Effect, so it doesn't cost an extra render pass. Matches apps/web's Inbox.
  const [prevNotifications, setPrevNotifications] = useState(notifications);
  const [shownNotifications, setShownNotifications] = useState<Notification[] | null>(null);
  if (notifications !== prevNotifications) {
    setPrevNotifications(notifications);
    if (notifications && shownNotifications === null) {
      setShownNotifications(notifications.filter(n => !n.read));
    }
  }

  // Opening the Aura tab marks everything read immediately, same as apps/web — not gated behind any
  // user action. Fires once auth is actually ready (not on raw mount) — a cold-start deep link
  // straight into this screen can render before @clerk/expo's async token cache resolves, and this
  // mutation needs a real token.
  useEffect(() => {
    if (isSignedIn) markAurasRead.mutate();
  }, [isSignedIn]);

  // Consequence of the frozen unread list appearing — mirrors the mount-only mark-read Effect above,
  // just triggered once shownNotifications settles instead of on mount. Depends on `.mutate` (stable
  // across renders — see @tanstack/react-query's useMutation source: it's wrapped in useCallback)
  // rather than the whole `markNotificationsRead` object, which useMutation() recreates on every
  // render — depending on the object would re-fire this Effect, and thus re-call the mutation, every
  // time the mutation's own pending/success transitions caused a re-render, looping indefinitely.
  useEffect(() => {
    if (shownNotifications?.length) markNotificationsRead.mutate();
  }, [shownNotifications, markNotificationsRead.mutate]);

  /* 10A: the segment bar renders immediately and only the data-dependent regions block out. A failure
     gets an inline retry instead, since the segments above it are perfectly usable. */
  if (isError) {
    return (
      <AuraShell segment={segment} onSegment={setSegment}>
        <View className="mt-5">
          <InlineFailure
            icon="aura"
            title="Your aura didn't load"
            body="It's safe — we just couldn't fetch it. Nothing is lost."
            onRetry={() => refetch()}
          />
        </View>
      </AuraShell>
    );
  }
  if (isLoading || !data) {
    return (
      <AuraShell segment={segment} onSegment={setSegment}>
        <View className="mt-4">
          <SkeletonBlock height={84} radius={22} />
        </View>
        <View className="mt-4">
          <SkeletonRows n={4} />
        </View>
      </AuraShell>
    );
  }

  const auras = data.auras;

  /* "No aura in here yet" used to stand in for the whole tab the moment your own aura list was
     empty. Activity outgrew that: it now carries your friends' picks and your notifications too, so a
     student with no picks of their own can still have a feed worth reading — and blanking it would
     show an empty-state on a screen with content behind it. Cards and Receipt are still genuinely
     empty without auras, so they keep the gate. */
  const feedEmpty = auras.length === 0 && !friendEvents?.length && !notifications?.length;

  return (
    <AuraShell segment={segment} onSegment={setSegment}>
      {(segment === 'activity' ? feedEmpty : auras.length === 0) ? (
        <AuraEmpty onVote={() => router.replace('/aura')} />
      ) : segment === 'activity' ? (
        <ActivitySegment
          auras={auras}
          friendEvents={friendEvents ?? []}
          notifications={notifications ?? []}
        />
      ) : segment === 'cards' ? (
        <CardsSegment
          auras={auras}
          member={!!data.infiniteAura}
          flipsLeft={data.flipsLeft}
          flipsPerDay={data.flipsPerDay}
        />
      ) : (
        <ReceiptSegment auras={auras} />
      )}
    </AuraShell>
  );
}

/* Shared frame, so the segment bar renders identically across the loading, failed, empty and populated
   states — 10A's rule that real chrome appears immediately depends on there being one frame.

   **No header.** A "Your aura" title, a status subtitle and an INFINITE pill used to sit above the
   segments. All three went: the title named the tab you had just tapped, the subtitle restated counts
   the segment underneath already shows, and the pill announced a membership on the one screen where
   you can see its effects directly. Together they cost about a fifth of the screen to tell you where
   you were. The segments are the header now — they say what you are looking at and let you change it.

   The status row (streak · coins · add-friends) is off for now too — see STATUS_ROW. That one isn't
   deleted: the row still lives in voteKit and the wiring here is one flag away. */
function AuraShell({
  segment,
  onSegment,
  children
}: {
  segment: Segment;
  onSegment: (s: Segment) => void;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: me } = useMe();
  return (
    <ScrollView
      className="flex-1 bg-ground"
      /* `flexGrow: 1` so the content fills the viewport even when it's shorter than one screen. That's
         what lets the Cards segment push its pager to the bottom with a flex spacer — without it the
         container collapses to its content and the spacer has nothing to expand into. */
      /* Tight to the safe area. The segment bar used to carry a 12pt top margin of its own on top of
         this, which with the header removed left a band of nothing between the status bar and the only
         control up there. The bar owns no margin now; this padding is the whole gap. */
      contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 6, paddingHorizontal: 21, paddingBottom: 8 }}
      showsVerticalScrollIndicator={false}
    >
      {STATUS_ROW && (
        <View className="mb-[18px]">
          <StatusRow
            coins={me?.coins ?? 0}
            streak={me?.streak ?? 0}
            onPeople={() => router.push('/add')}
            onCoins={() => router.push('/shop')}
          />
        </View>
      )}

      <SegmentBar value={segment} onChange={onSegment} />
      {children}
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────
// Activity
// ─────────────────────────────────────────────────────────────

/* The feed. One row per event, yours and your friends' interleaved, newest first.

   The friend rows the design always wanted are real now — `friendActivity` (apps/api/src/auras.ts)
   backs them. What it deliberately does *not* carry is what a friend was picked for; see that file.
   So a friend row is a gender and a first name, and it can never grow into a leak of Emma's
   superlatives no matter what gets added to this screen later.

   Everything below the stat card is ungrouped on purpose. The day summary that used to stand here
   ("19 girls and 13 boys picked you") answered the question before you scrolled. */
function ActivitySegment({
  auras,
  friendEvents,
  notifications
}: {
  auras: Aura[];
  friendEvents: FriendActivityEvent[];
  notifications: Notification[];
}) {
  const router = useRouter();
  const { data: me } = useMe();
  const today = withinDays(auras, 1);
  const split = splitOf(today);
  const days = activityFeed(auras, friendEvents, notifications);

  return (
    <>
      <View className="mt-[14px] rounded-22 bg-surface px-4 py-[15px]">
        <View className="flex-row items-baseline gap-[9px]">
          <Text className="font-fredoka-700 text-[38px] leading-[38px]" style={{ color: '#FF5CA8' }}>
            {today.length}
          </Text>
          {/* "Last 24 hours", not "today": this is a rolling window, and the day sections below are
              calendar days. Calling a rolling count "today" is how a 4 up here ends up sitting above
              a YESTERDAY heading holding the same four picks. */}
          <Text className="font-nunito-800 flex-1 text-[13px] leading-[17px] text-ink-secondary">
            {today.length === 1 ? 'pick in the last\n24 hours' : 'picks in the last\n24 hours'}
          </Text>
          <View className="items-end">
            <Text className="font-fredoka-700 text-[19px] leading-[19px]" style={{ color: '#6BF2C2' }}>
              {me?.streak ?? 0}
            </Text>
            <Text className="font-nunito-800 mt-[2px] text-[10.5px]" style={{ color: '#848286' }}>
              DAY STREAK
            </Text>
          </View>
        </View>

        {/* The bar is the gender split, so it only earns its place when there is a split to show. A
            day where every sender is behind the cohort floor would otherwise print one flat grey
            band that says nothing — the line under it already carries the count. */}
        {today.length > 0 && !allGendersWithheld(split) && (
          <>
            <View className="mt-3 h-[7px] flex-row gap-[3px] overflow-hidden rounded-pill">
              {split.girls > 0 && <View style={{ flex: split.girls, backgroundColor: GENDER_ACCENT.girl }} />}
              {split.boys > 0 && <View style={{ flex: split.boys, backgroundColor: GENDER_ACCENT.boy }} />}
              {split.nb > 0 && <View style={{ flex: split.nb, backgroundColor: GENDER_ACCENT.nonbinary }} />}
              {split.unknown > 0 && <View style={{ flex: split.unknown, backgroundColor: UNKNOWN_ACCENT }} />}
            </View>
            <Text className="font-nunito-800 mt-2 text-[11.5px] text-ink-muted">{pickedYouPhrase(split)}</Text>
          </>
        )}
      </View>

      {days.map(day => (
        <View key={day.key}>
          <Text className="font-nunito-900 mt-[15px] text-[11px]" style={{ color: '#57545A', letterSpacing: 0.9 }}>
            {day.label}
          </Text>
          <View className="mt-[9px] gap-[9px]">
            {day.items.map(item => (
              <ActivityRow
                key={item.id}
                item={item}
                onPress={
                  item.kind === 'pick'
                    ? () => router.push({ pathname: '/flip', params: { id: item.id } })
                    : item.kind === 'friend'
                      ? () => router.push({ pathname: '/u', params: { userId: item.friendId } })
                      : undefined
                }
              />
            ))}
          </View>
        </View>
      ))}

      <Text className="font-nunito-800 py-4 text-center text-[12.5px] text-ink-faint">
        aura fades after 30 days ✨
      </Text>
    </>
  );
}

/* One event.

   The disc is always the *giver*, coloured by their gender — so the colour and the sentence say the
   same thing twice, which is what lets the feed be skimmed at colour-speed rather than read. A
   withheld gender takes the grey, the same grey the split bar and the card faces use for it.

   Your own rows sit a shade lighter than your friends'. That's the only weighting: the sentence
   already says "you", and any louder treatment would turn a feed you scroll into a scoreboard where
   two thirds of the rows are visibly the boring ones. */
function ActivityRow({ item, onPress }: { item: ActivityItem; onPress?: () => void }) {
  const mine = item.kind === 'pick';
  const isNote = item.kind === 'note';
  const accent = isNote ? TRACK : GENDER_ACCENT[item.gender] ?? UNKNOWN_ACCENT;

  const body = (
    <View
      className="flex-row items-center gap-[11px] rounded-18 px-[13px] py-[11px]"
      style={{ backgroundColor: mine ? '#4A474B' : '#3C393E' }}
    >
      <View
        className="items-center justify-center"
        style={{ width: 34, height: 34, borderRadius: 99, backgroundColor: accent }}
      >
        {isNote ? (
          <Text style={{ fontSize: 16 }}>{item.emoji || '🔔'}</Text>
        ) : (
          /* Dark ink on the accent rather than white — the gender colours are bright enough that a
             white mark on mint disappears. Same value the split bar's chips use. */
          <AuraIcon name="aura" size={17} color="#221F22" filled />
        )}
      </View>
      <View className="min-w-0 flex-1">
        <Text className="font-nunito-900 text-[13px] leading-[17px] text-white">
          {isNote ? item.text : auraLine(item.gender, mine ? 'you' : item.friendName)}
        </Text>
        <Text className="font-nunito-700 mt-[2px] text-[11.5px]" style={{ color: '#848286' }}>
          {relativeTime(item.ts)}
        </Text>
      </View>
      {/* Only where there's somewhere to go. A chevron on a notification row would promise a screen
          that doesn't exist. */}
      {onPress && <AuraIcon name="chevronRight" size={16} color="#6E6B71" />}
    </View>
  );

  return onPress ? <Pressable onPress={onPress}>{body}</Pressable> : body;
}

// ─────────────────────────────────────────────────────────────
// Cards
// ─────────────────────────────────────────────────────────────

/* Four to a page, so each one is a real card rather than a tile.

   The slot above the filter holds the upsell for a free user and the flip state for a member — same
   position, same height, so the layout doesn't move between the two states. */
function CardsSegment({
  auras,
  member,
  flipsLeft,
  flipsPerDay
}: {
  auras: Aura[];
  member: boolean;
  flipsLeft: number;
  flipsPerDay: number;
}) {
  const router = useRouter();
  const revealName = useRevealAuraName();
  const markAuraOpened = useMarkAuraOpened();
  const clock = useRoamClock();

  /* Which page you're on is in the URL for the same reason the segment is: this screen is unmounted
     while a card is open, and coming back to page 1 after flipping something on page 3 loses your
     place in the one part of the tab you actually navigate around in.

     The gender filter used to live here too (`?g=`). It's gone — the grid is one stack of cards now,
     and slicing it by gender was a way of sorting people that the tab is better off not offering. */
  const params = useLocalSearchParams<{ p?: string }>();
  const page = Math.max(0, Number.parseInt(params.p ?? '', 10) || 0);
  const setPage = (p: number) => router.setParams({ p: String(p) });

  const filtered = auras;

  // Clamped during render rather than reset in an Effect: the page can also fall out of range when
  // the query refetches with fewer auras, and there is no event to hang that on.
  const maxPage = Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1);
  const safePage = Math.min(page, maxPage);
  const start = safePage * PAGE_SIZE;
  const pageCards = filtered.slice(start, start + PAGE_SIZE);

  /* The glow visits one *unflipped* card at a time — a flipped card is already spent, so lighting it
     would be pointing at nothing. Slots are ranks within the unflipped subset, which is what keeps
     exactly one card lit however many of them are already open. */
  const unflipped = pageCards.map((c, i) => ({ c, i })).filter(x => !x.c.name && !x.c.anonymous);
  const slotOf = new Map<number, number>();
  roamSlots(unflipped.length).forEach((pos, slot) => {
    const entry = unflipped[pos];
    if (entry) slotOf.set(entry.i, slot);
  });

  /* Tapping a card. A mutation in the handler that started it, never in an Effect keyed off a "should
     I flip now" flag — and the destinations are five:
       already flipped → the deck, where the names you've flipped live
       anonymous       → the protected screen; nothing is spent, so nothing is charged
       out of flips    → the same screen, which says when they come back rather than doing nothing
       member          → spend a flip on *this card*, then the reveal
       free            → the paywall, because flipping is the only way to open a card and the
                         membership is the only way to flip

     That last one used to be the clue card, where coins bought the grade and the first initial one
     scratch at a time. There is no half-open card any more, so there is nothing to sell a non-member
     except the thing that turns cards over.

     `outOfFlips` is checked here as well as on the server. Not as the gate — the server is the gate —
     but so an empty allowance reads as a screen that explains itself instead of a tap that returns an
     error toast. */
  const outOfFlips = member && flipsLeft <= 0;

  function openCard(f: Aura) {
    /* Recorded here rather than on the card screen, and in the handler rather than an Effect.

       This tap *is* the event — the card screen would have to reconstruct it from a mount, which is
       the "mutation in an Effect" smell the house rules call out (see CLAUDE.md). Here it also lands
       in the one place that already knows the tap didn't open anything: the `!member` branch below
       diverts to the paywall without ever showing the card, so marking it opened there would be a lie.

       Fire-and-forget; navigation doesn't wait on it. See useMarkAuraOpened. */
    const markOpened = () => markAuraOpened.mutate(f.id);

    // An open card reopens its own reveal. It used to go to a separate deck screen; that's gone, and
    // the card itself is the record of the flip anyway.
    if (f.name) return router.push({ pathname: '/flip', params: { id: f.id } });
    if (f.anonymous) {
      markOpened();
      return router.push({ pathname: '/flip', params: { id: f.id } });
    }
    if (!member) return router.push('/infinite');
    if (outOfFlips) {
      markOpened();
      return router.push({ pathname: '/flip', params: { id: f.id, spent: '1' } });
    }
    markOpened();
    /* Open it, don't spend it. A tap used to charge the flip outright, which made a mis-tap cost one of
       two a day with nothing between the finger and the charge.

       A bottom sheet stood here for a while and did prevent that, but it answered the question in the
       wrong place: a small card in a dialog, asking about a screen you hadn't seen. The card screen is
       already the best view of the card in the app, so the confirm lives there — you see it face down
       at full size and the button under it is what turns it over. */
    router.push({ pathname: '/flip', params: { id: f.id } });
  }

  return (
    <>
      {/* Matched to the spacer below the card, so the allowance floats midway between the segment bar
          and the grid rather than hanging off the top of the screen. Both are `flex: 1`, so whatever
          height the grid doesn't use is split evenly above and below it. */}
      <View style={{ flex: 1, minHeight: 16 }} />

      {member ? (
        /* Just the allowance now, full width. A "CARDS OWNED" tile sat beside it and opened a deck
           screen of the names you'd flipped; both are gone. The deck was a second place to look at
           cards you can already see in the grid — the flipped ones are right there, in colour, and
           tapping one reopens its reveal. */
        <View className="flex-row justify-center">
          {/* The allowance, drawn as stars rather than a number alone — a spent flip going dark is
              the readable version of "one left", and it's the same aura mark the tab is named for.

              Sized to its contents and centred, rather than stretched across the row. Full width left
              a third of the card empty on the right, because the two lines inside are short and no
              amount of type scaling was going to fill a 360pt box with "Flips refill in:". */}
          <View className="flex-row items-center gap-[22px] rounded-24 bg-surface px-[24px] py-[18px]">
            <View className="flex-row gap-[3px]">
              {Array.from({ length: Math.max(flipsPerDay, 1) }, (_, i) => (
                /* Pink, not mint. This is the Aura tab and the aura mark is pink everywhere it stands
                   for the tab itself — the tab bar's own active icon included. Mint is the Vote tab's
                   colour, so a mint star here was borrowing the wrong screen's accent. A spent flip
                   still goes grey; that contrast is the whole point of drawing them as stars. */
                /* Solid while you hold it, hollow once it's gone.

                   Colour alone was doing all the work before, and at a glance two pink stars and two
                   grey ones read as "four of something" rather than "two left of two". Filled-versus-
                   outline is the difference you can see without looking. */
                <AuraIcon
                  key={i}
                  name="aura"
                  size={34}
                  color={i < flipsLeft ? '#FF5CA8' : '#5C595E'}
                  filled={i < flipsLeft}
                />
              ))}
            </View>
            {/* No `flex-1` — that's what was holding the card open to the full row. It sizes to the
                longest of its two lines now, which is what lets the card hug them. */}
            <View>
              {/* Spent, the label is the countdown's own lead-in — white for the words, mint for the
                  clock, so the part that's actually moving is the part that's coloured. With flips in
                  hand there's nothing to count down to and the line just says what you have. */}
              <Text className="font-fredoka-700 text-[19px] leading-[23px] text-white">
                {flipsLeft === 0 ? 'Flips refill in:' : `${flipsLeft} flip${flipsLeft === 1 ? '' : 's'} left today`}
              </Text>
              {flipsLeft === 0 ? <ResetCountdown /> : (
                <Text className="font-nunito-700 mt-[3px] text-[13.5px] text-ink-muted">Resets at midnight</Text>
              )}
            </View>
          </View>
        </View>
      ) : (
        // No top margin either — the spacer above centres this the same way it centres the allowance.
        <View>
          {/* Dark card, purple button — the inverse of what this was.

              It used to be a purple slab with a white button, which made the whole banner the loudest
              object on a screen whose subject is the grid of cards below it. Moving the purple onto the
              button alone keeps the colour where it does work — on the thing you tap — and lets the
              banner sit at the same weight as the rest of the surface furniture.

              The mark is three cards rather than one star: what's being sold is the flip, and a small
              fan of cards says that without a word. */}
          <ToyShadow depth={4} shadowColor="#2E2C30" backgroundColor="#403E41" radius={20} onPress={() => router.push('/infinite')}>
            <View className="flex-row items-center gap-[13px] px-[15px] py-[13px]">
              <FlipDeckMark />
              <View className="min-w-0 flex-1">
                <Text className="font-fredoka-700 text-[16px] leading-[19px] text-white">Flip a card, see a name</Text>
                {/* The real allowance, not a spelled-out "Two" — dailyFlips is a tunable dial, so the
                    number has to come from the server or the pitch goes stale the day it's retuned. */}
                <Text className="font-nunito-800 mt-[2px] text-[11px] text-ink-muted">
                  {flipsPerDay} flips a day with Infinite Aura
                </Text>
              </View>
              {/* Not pressable itself — the whole banner is. A nested Pressable would give the same
                  destination two targets and swallow taps that land on its edge. */}
              <ToyShadow depth={3} shadowColor="#5B3FD1" backgroundColor="#7C5CFF" radius={9999}>
                <View className="px-[15px] py-[8px]">
                  <Text className="font-nunito-900 text-[12.5px] text-white">Get</Text>
                </View>
              </ToyShadow>
            </View>
          </ToyShadow>
        </View>
      )}

      {revealName.isError && (
        <View className="mt-3">
          <AuthError message={(revealName.error as Error).message} />
        </View>
      )}

      {/* The other half of the pair. Everything below this point is fixed: grid, then PAGER_GAP, then
          the pager, then the gap to the tab bar — which also comes to PAGER_GAP. So the pager stays
          pinned to the bottom and the two distances either side of it match, while the slack above the
          grid is shared with the spacer at the top of this segment. */}
      <View style={{ flex: 1, minHeight: 16 }} />

      <View className="gap-3">
        {[0, 2].map(row => (
          <View key={row} className="flex-row gap-3">
            {[0, 1].map(col => {
              const aura = pageCards[row + col];
              // A dashed placeholder, not an invisible spacer: the grid keeps its shape on a short page.
              if (!aura) return <EmptyCardSlot key={col} />;
              const slot = slotOf.get(row + col);
              const roam: CardRoam = slot === undefined ? null : { slot, of: unflipped.length, clock };
              return <AuraCardFace key={aura.id} aura={aura} roam={roam} onPress={() => openCard(aura)} />;
            })}
          </View>
        ))}
      </View>

      {/* An empty filter says so with four empty slots and a 0 on the chip you just tapped. It used to
          also print "No cards from that group yet" underneath, which pushed the pager off its mark and
          explained something already on screen twice over. */}

      {/* Always rendered, including on a filter with nothing in it. An empty group used to drop the
          pager entirely, so the bottom of the screen changed shape depending on which chip you had
          tapped — and the way back out of an empty filter disappeared along with it. With no pages
          both directions are simply spent, which is a state the buttons already know how to show. */}
      <PagerRow
        atStart={safePage <= 0}
        atEnd={safePage >= maxPage}
        onPrev={() => setPage(Math.max(0, safePage - 1))}
        onNext={() => setPage(Math.min(maxPage, safePage + 1))}
      />
      {/* The gap under the pager, sized so it matches PAGER_GAP once the scroll view's own bottom
          padding and the tab bar's top padding are counted. */}
      <View style={{ paddingBottom: PAGER_TAIL }} />
    </>
  );
}

/* Three cards fanned left to right, the front one carrying the aura mark.

   Drawn rather than iconified: this is the only place in the app that needs to say "a deck of cards
   you can turn over" in 54 points, and AuraIcon's set is single-glyph by design. Three overlapping
   rounded rects with the app's own accents does it, and it stays in step with the real cards because
   it borrows the same gender colours the grid uses — pink and blue — with purple on the front card
   because purple is what Infinite Aura is coloured everywhere else.

   All three are filled with the card ground rather than left transparent, so the ones behind occlude
   properly instead of showing the banner through their overlap. */
function FlipDeckMark() {
  const card = {
    position: 'absolute' as const,
    top: 0,
    width: 26,
    height: 38,
    borderRadius: 7,
    borderWidth: 2,
    backgroundColor: '#2C2A2D'
  };
  return (
    <View style={{ width: 52, height: 38 }}>
      <View style={[card, { left: 0, borderColor: '#FF5CA8' }]} />
      <View style={[card, { left: 12, borderColor: '#4FC3F7' }]} />
      <View style={[card, { left: 24, borderColor: '#7C5CFF', alignItems: 'center', justifyContent: 'center' }]}>
        <AuraIcon name="aura" size={15} color="#7C5CFF" />
      </View>
    </View>
  );
}

/* The countdown under "No flips left today".

   A real interval, which is the legitimate kind of Effect — a clock is an external system, and there
   is no event to derive the current time from. It ticks every second rather than every minute so the
   final minute counts down visibly instead of sitting still; above an hour `timeToReset` rounds to
   minutes anyway, so the extra ticks are cheap re-renders of one short string.

   Mounted only in the spent state, so the interval exists exactly while something on screen depends on
   it, and unmounting clears it. */
function ResetCountdown() {
  const [left, setLeft] = useState(() => timeToReset());
  useEffect(() => {
    const id = setInterval(() => setLeft(timeToReset()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <Text className="font-fredoka-700 mt-[2px] text-[22px] leading-[25px]" style={{ color: '#6BF2C2' }}>
      {left}
    </Text>
  );
}

// ─────────────────────────────────────────────────────────────
// Receipt
// ─────────────────────────────────────────────────────────────

/* The thing you post. Day, week or month; every line printed, no "more" link; and one Share button
   that opens the system sheet rather than three app-specific ones.

   Nothing here can carry a name — the lines are superlatives and counts, and the share text is built
   from the same two. That's a property of how it's assembled, not a filter applied at the end. */
function ReceiptSegment({ auras }: { auras: Aura[] }) {
  const { data: me } = useMe();
  const [period, setPeriod] = useState<Period>('week');
  const spec = periodSpec(period);

  const inPeriod = withinDays(auras, spec.days);
  const lines = receiptLines(inPeriod);
  const split = splitOf(inPeriod);
  const school = me?.school?.name ?? null;

  async function share() {
    await Share.share({
      message: receiptShareText(inPeriod.length, split, lines, period, school)
    });
  }

  /* Paper first, controls under it.

     The period switch used to lead, which put a row of chrome between the segment bar and the thing
     this tab is for. The receipt is the object — it goes at the top, at the size it deserves, and the
     two things you do *to* it (change the window, post it) sit underneath in the order you reach for
     them. That also puts the switch next to Share, where changing the period reads as "this is what
     I'd be posting".

     Two lines came off the bottom: "Names are stripped from anything you post", and an InfoCard
     explaining that the receipt counts picks rather than people. The first is a real fact but it was
     the third element in a row explaining a button; the second described how to read a list of
     numbers that already reads fine. See the copy rule in CLAUDE.md. */
  return (
    <>
      {/* Not flex-1 any more. Stretching this block pushed all the leftover height into the gap above
          the period switch, so the switch sat nearer to Share than to the paper. The three elements are
          evenly spaced by RECEIPT_GAP instead and the slack falls below the button, where nothing is
          measuring against it. */}
      <View className="mt-4">
        <ToyShadow depth={7} shadowColor="#D9C7AF" backgroundColor="#FFF6E8" radius={10}>
          {/* The roomy size, not the compact one. The compact scale existed because the period bar,
              two helper lines and an InfoCard were sharing the screen with it; with those gone the
              paper is the screen and can print at a size you'd actually want to post. */}
          <ReceiptPaper
            compact={false}
            subtitle={`${school ? `${school.toUpperCase()} · ` : ''}${spec.subtitle}`}
            lines={lines}
            total={inPeriod.length}
            split={split}
            delta={periodDelta(auras, period)}
            closer={receiptCloser(inPeriod.length, period)}
          />
        </ToyShadow>
      </View>

      <View style={{ marginTop: RECEIPT_GAP }}>
        <PeriodBar value={period} options={PERIODS.map(p => ({ key: p.key, label: p.label }))} onChange={setPeriod} />
      </View>

      <View style={{ marginTop: RECEIPT_GAP }}>
        <ToyShadow depth={4} shadowColor="#3FBF95" backgroundColor="#6BF2C2" radius={9999} onPress={share}>
          <View className="flex-row items-center justify-center gap-2 py-[15px]">
            <AuraIcon name="share" size={19} color="#0A3B2C" />
            <Text className="font-fredoka-700 text-[17px]" style={{ color: '#0A3B2C' }}>
              Share
            </Text>
          </View>
        </ToyShadow>
      </View>

      <View style={{ paddingBottom: PAGER_TAIL }} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Empty
// ─────────────────────────────────────────────────────────────

/* Per the design's note: no membership banner when there is nothing to unlock — the ask is voting,
   not paying. */
function AuraEmpty({ onVote }: { onVote: () => void }) {
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
          We'll notify you the second someone picks you — a pick never says who until you open it.
        </InfoCard>
        <InfoCard icon="mail">More classmates at your school means more people who can pick you.</InfoCard>
      </View>
    </>
  );
}
