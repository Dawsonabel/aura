import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Share, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@clerk/expo';
import type { Aura } from '@aura/api-client';
import { useAuras } from '../../src/hooks/useAuras';
import { useMe } from '../../src/hooks/useMe';
import { useMarkAurasRead } from '../../src/hooks/useMarkAurasRead';
import { useSchoolmates } from '../../src/hooks/useSchoolmates';
import { useBlockedPeople } from '../../src/hooks/useBlockedPeople';
import { useMarkAuraOpened } from '../../src/hooks/useMarkAuraOpened';
import { useNotifications, type Notification } from '../../src/hooks/useNotifications';
import {
  useFriendActivity,
  type FriendActivityEvent,
  type FriendMilestone
} from '../../src/hooks/useFriendActivity';
import { useDismissed } from '../../src/hooks/useDismissed';
import { useMarkNotificationsRead } from '../../src/hooks/useMarkNotificationsRead';
import { useRevealAuraName } from '../../src/hooks/useRevealAuraName';
import { AuraIcon } from '../../src/components/AuraIcon';
import { EmptyState, InlineFailure, SkeletonBlock, SkeletonRows } from '../../src/components/stateKit';
import { ToyShadow } from '../../src/components/ToyShadow';
import { StatusRow } from '../../src/components/voteKit';
import { AuthError } from '../../src/components/authKit';
import {
  AuraCardFace,
  EmptyCardSlot,
  GENDER_ACCENT,
  GENDER_GROUND,
  PAGER_TAIL,
  PagerRow,
  PeriodBar,
  ReceiptPaper,
  SegmentBar,
  TRACK,
  UNKNOWN_ACCENT,
  UNKNOWN_GROUND,
  roamSlots,
  useRoamClock,
  type CardRoam,
  type Segment
} from '../../src/components/auraKit';
import {
  PERIODS,
  activityFeed,
  auraLine,
  milestoneLine,
  pickLine,
  repeatChip,
  periodDelta,
  periodSpec,
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
  const { data: notifications, isLoading: notificationsLoading } = useNotifications();
  const { data: friendData, isLoading: friendLoading } = useFriendActivity();
  const markNotificationsRead = useMarkNotificationsRead();

  /* The Activity feed is a merge of four queries, and it used to render the moment the *first* one
     landed. `useAuras` is the fastest of them, so the tab reliably painted your own picks alone, then
     jolted as the friend rows sorted themselves into the same day groups and the promo pushed
     everything down. One feed assembling itself in three visible stages.

     So Activity waits for all of them. `useSchoolmates`/`useBlockedPeople` are the promo's, read here
     only to know when it can draw — FriendsPromo calls the same two hooks itself, and React Query
     dedupes by query key, so this is a readiness check rather than a second pair of requests.

     Scoped to Activity on purpose. Cards and Receipt are built from `useAuras` alone; making them wait
     on the friend graph would be paying this tab's cost on two screens that don't merge anything. */
  const { isLoading: schoolmatesLoading } = useSchoolmates();
  const { isLoading: blockedLoading } = useBlockedPeople();
  const activityPending = friendLoading || notificationsLoading || schoolmatesLoading || blockedLoading;

  /* Filters the feed by whose rows they are. `activityFeed` takes its four sources as separate
     arguments, so filtering is a matter of handing it empty arrays rather than a second pass over the
     merged list — the global sort, the cap and the day bucketing all keep working untouched.

     Notifications count as "me": a report being resolved or a friend request landing is an event about
     you, and "only friends" is a request to see other people rather than a request to hide your own
     admin. */
  const feedSources = (f: FeedFilter) => ({
    auras: data?.auras ?? [],
    events: f === 'me' ? [] : (friendData?.events ?? []),
    milestones: f === 'me' ? [] : (friendData?.milestones ?? []),
    notifications: notifications ?? []
  });

  /* The active segment lives in the URL, not in state.

     `(app)` renders a `<Slot />`, so opening a card unmounts this screen outright — component state
     would come back as the default and drop you back on the first segment every time you closed a
     reveal. The segment is part of where you are, and the URL is what survives a round trip through
     the router, so that's where it goes. Deep-linking straight to /inbox?seg=receipt falls out of it.

     Activity is the default, matching its place at the head of SEGMENTS. Cards held this for a while
     on the argument that it's the reason to open the tab — but that's an argument about what you came
     for, not about what should meet you. The feed is the thing that changes between visits, so it's
     what makes opening the tab worth doing twice; the grid is one tap away and isn't going anywhere. */
  /* The feed filter rides in the URL for exactly the same reason the segment does — it has to survive
     the unmount that opening a card causes, or every reveal you close silently resets it to "all". */
  const { seg, feed } = useLocalSearchParams<{ seg?: string; feed?: string }>();
  const segment: Segment = seg === 'cards' || seg === 'receipt' ? seg : 'activity';
  const feedFilter: FeedFilter = feed === 'me' ? 'me' : 'all';
  const setFeedFilter = (f: FeedFilter) => router.setParams({ feed: f });

  /* The promo is closable, and closing it is what reveals the filter — one control in one slot rather
     than both stacked above the feed. See FriendsPromo for why the flag is stored rather than held. */
  const promo = useDismissed('aura.inbox.friendsPromoDismissed');
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
  /* Two gates, one skeleton. The first is every segment waiting on its only source; the second is
     Activity additionally waiting on the three that merge into it, so the feed arrives assembled
     rather than in stages.

     Skeletons rather than the breathing wordmark (LoadingScreen). That screen is the cold-start gate —
     it covers the tab bar and the segment bar, so using it here would make every visit to this tab
     look like the app relaunching, and 10A's rule is that real chrome appears immediately and only the
     data-dependent region blocks out. The block-and-rows shape also holds the space the hero card and
     the feed are about to occupy, so nothing jumps when they land. */
  if (isLoading || !data || (segment === 'activity' && activityPending)) {
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
  const feedEmpty =
    auras.length === 0 &&
    !friendData?.events.length &&
    !friendData?.milestones.length &&
    !notifications?.length;

  return (
    <AuraShell segment={segment} onSegment={setSegment}>
      {/* Hoisted out of ActivitySegment so it survives the empty state.

          It used to live inside, which meant `AuraEmpty` replaced it — the card whose entire job is to
          fix an empty feed was shown only to people whose feed already had something in it. The second
          info card down there even tells you to go get more classmates, with the button that does it
          removed from the screen one line above.

          The toggle is *not* hoisted, and stays inside: filtering nothing is not a control anyone
          needs. `=== true` because null means the stored flag hasn't been read yet, and neither the
          card nor the switch should draw until we know which one belongs there. */}
      {segment === 'activity' && promo.dismissed === false && <FriendsPromo onClose={promo.dismiss} />}

      {(segment === 'activity' ? feedEmpty : auras.length === 0) ? (
        <AuraEmpty onVote={() => router.replace('/aura')} />
      ) : segment === 'activity' ? (
        <ActivitySegment
          sources={feedSources(feedFilter)}
          filter={feedFilter}
          onFilter={setFeedFilter}
          promoClosed={promo.dismissed === true}
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

/* Whose rows the feed shows. Two states, because a switch only has two — and the third ("only
   friends") was the least wanted of the three: this tab exists to tell you about your own aura, and
   the friend rows are context around that rather than a view you'd sit in.

   Being a real toggle also fixes what a segmented bar couldn't: it sat directly under the
   Activity/Cards/Receipt bar wearing the same track, the same pill and the same type, so the screen
   appeared to have two rows of tabs and no way to tell which one moved you between screens. */
export type FeedFilter = 'all' | 'me';

/* Label plus track-and-knob, right-aligned and about a third of the width the segment bar takes.
   Every one of those is doing the same job: none of it can be mistaken for the tabs above it.

   The label is the *on* state, which is why there's no word for "all". A switch reads as one claim you
   turn on or off — "Only me", off — and adding a second label to explain the off position would make
   it a two-item menu again. */
function FeedToggle({ value, onChange }: { value: FeedFilter; onChange: (f: FeedFilter) => void }) {
  const on = value === 'me';
  const slide = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    slide.value = withTiming(on ? 1 : 0, { duration: 160, easing: Easing.out(Easing.quad) });
  }, [on, slide]);

  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: interpolate(slide.value, [0, 1], [3, 24]) }] }));
  const track = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(slide.value, [0, 1], ['#3C393E', '#6BF2C2'])
  }));

  /* The margins are the point of this wrapper, and they're deliberately lopsided.

     Below: -15, which cancels the 15pt top margin the first day header carries and sits the switch
     against the list. It belongs to the feed it filters, so it should read as attached to it rather
     than floating between the tabs and the feed as a third thing. That negative is fighting a margin
     this component can't see and shouldn't edit — `mt-[15px]` on the day label also spaces every
     *later* day group, so shrinking it there would tighten the whole feed to fix one gap at the top.

     Above: 20pt. Still clear of the segment bar — the two sat 14pt apart with the switch on the same
     right edge as the Receipt tab, and a thumb catching the wrong one changes screen — but less than
     the 26 it briefly had, which became an obvious hole once the bottom closed up. */
  return (
    <View className="mt-[20px] flex-row items-center justify-end gap-[11px]" style={{ marginBottom: -15 }}>
      <Text className="font-nunito-900 text-[15px]" style={{ color: on ? '#FFFFFF' : '#848286', letterSpacing: 0.3 }}>
        Only me
      </Text>
      <Pressable
        onPress={() => onChange(on ? 'all' : 'me')}
        accessibilityRole="switch"
        accessibilityState={{ checked: on }}
        accessibilityLabel="Only me"
        hitSlop={12}
      >
        <Animated.View style={[{ width: 52, height: 31, borderRadius: 99, justifyContent: 'center' }, track]}>
          <Animated.View
            style={[{ width: 25, height: 25, borderRadius: 99, backgroundColor: '#FFFFFF' }, knob]}
          />
        </Animated.View>
      </Pressable>
    </View>
  );
}

/* The feed. One row per event, yours and your friends' interleaved, newest first.

   The friend rows the design always wanted are real now — `friendActivity` (apps/api/src/auras.ts)
   backs them. What it deliberately does *not* carry is what a friend was picked for; see that file.
   So a friend row is a gender and a first name, and it can never grow into a leak of Emma's
   superlatives no matter what gets added to this screen later.

   Everything below the stat card is ungrouped on purpose. The day summary that used to stand here
   ("19 girls and 13 boys picked you") answered the question before you scrolled. */
function ActivitySegment({
  sources,
  filter,
  onFilter,
  promoClosed
}: {
  sources: { auras: Aura[]; events: FriendActivityEvent[]; milestones: FriendMilestone[]; notifications: Notification[] };
  filter: FeedFilter;
  onFilter: (f: FeedFilter) => void;
  promoClosed: boolean;
}) {
  const router = useRouter();
  const { data: me } = useMe();
  const days = activityFeed(sources.auras, sources.events, sources.milestones, sources.notifications);

  return (
    <>
      {/* One slot, two occupants. The promo sits here until it's closed, and closing it hands the space
          to the filter rather than just collapsing — the room the card was using goes back to the feed,
          minus a control that's a fraction of its height.

          Deliberately not both at once. A promo asking you to add friends stacked on top of a switch
          for hiding friends is two contradictory things competing for the top of the same screen.

          What stood here before either was the school pulse — today's vote count for the whole school
          — and before that your own 24-hour count, streak and gender split. All stats: true, and
          nothing you could act on. `schoolPulse` is still served and still tested; it just isn't
          drawn. */}
      {promoClosed && <FeedToggle value={filter} onChange={onFilter} />}

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
                    : item.kind === 'friend' || item.kind === 'milestone'
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

/* The ad at the top of the feed. A count, who it counts, and the button.

   **No body copy, and don't add it back.** Two versions were written and both were cut: one selling
   candidate weighting, one selling activity and mutuals. The count and the button already say the
   whole thing — a number of people from your school, and the way to reach them — and a sentence
   underneath explaining what friends are for is the exact pattern CLAUDE.md keeps cutting. If a reason
   to add friends ever needs stating, `/add` is where it belongs; that screen already carries it.

   The reason *we* want a dense friend graph — a real one is what separates an actual student from an
   imposter, which a name-and-grade directory can't establish on its own — stays out of the UI on
   purpose. It's our reason, not a benefit on offer, and phrasing it as one recruits a fifteen-year-old
   into moderation and tells anyone gaming the system which signal to fake.

   No faces either. Nothing populates `photo` yet, so a row of avatars would be a row of coloured
   initials pretending to be people. */
function FriendsPromo({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { data: me } = useMe();
  const { data: schoolmates } = useSchoolmates();
  const { data: blockedPeople } = useBlockedPeople();

  /* Two different numbers, deliberately.

     What's *shown* is how many people from your school are on Aura at all — `schoolmates` is already
     school-scoped and already excludes you (getUsersBySchool takes your id as excludeId), so its
     length is the figure as-is. It's social proof: the school is here, and it doesn't move when you
     add someone, which is what makes it a headline rather than a chore counter.

     What *gates* the card is how many of them you could still add — blocked people filtered out the
     same way add.tsx filters them, since befriending someone you blocked is refused server-side. With
     nobody left to add there's nothing to advertise, and the card should leave rather than nag about a
     directory you've exhausted. Keeping the gate separate is the whole reason the shown number is free
     to be the flattering one. */
  const blockedIds = new Set((blockedPeople ?? []).map(b => b.user.id));
  const onAura = (schoolmates ?? []).length;
  const addable = (schoolmates ?? []).filter(s => s.friendState === 'none' && !blockedIds.has(s.id)).length;
  if (addable === 0) return null;

  return (
    <View
      className="mt-[14px] rounded-22 px-[18px] pb-[16px] pt-[15px]"
      style={{ backgroundColor: '#2B3835', borderWidth: 1, borderColor: '#385E52' }}
    >
      <View className="flex-row items-center gap-[11px]">
        <Text className="font-fredoka-700 text-[46px] leading-[48px]" style={{ color: '#6BF2C2' }}>
          {onAura}
        </Text>
        {/* One Text, one weight, one colour. The tail used to be a nested grey span, which split the
            sentence into a claim and a footnote — and the footnote was the half carrying the verb. All
            white reads as one statement, which is what it is.

            Still a single Text rather than stacked ones, for the reason that outlived the grey: as
            siblings the tail hard-broke onto its own line wherever the school name happened to wrap,
            so a two-word school stranded a line. Nested, it flows and breaks wherever it needs to. */}
        <View className="min-w-0 flex-1">
          <Text numberOfLines={3} className="font-nunito-900 text-[13px] leading-[17px] text-white" style={{ letterSpacing: 0.6 }}>
            {`PEOPLE FROM ${(me?.school?.name ?? 'YOUR SCHOOL').toUpperCase()} ARE AURA FARMING`}
          </Text>
        </View>
        {/* Top-right, and given a hit area much larger than the glyph — 11px of padding around a 15px
            icon. A close control that's hard to hit is worse than no close control, and this one sits
            in the corner where a thumb arrives at an angle.

            `items-start` on the row above would normally be needed to pin this to the top; the row is
            `items-center` and the X is the shortest child, so it centres against the 48px number and
            lands level with the copy. That reads better here than true corner alignment, which would
            float it above the text with nothing beside it. */}
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={8}
          className="-mr-[6px] -mt-[6px] self-start p-[11px]"
        >
          <AuraIcon name="close" size={15} color="#7C9E92" />
        </Pressable>
      </View>

      <View className="mt-[14px]">
        <ToyShadow depth={4} shadowColor="#3FBF95" backgroundColor="#6BF2C2" radius={9999} onPress={() => router.push('/add')}>
          <View className="flex-row items-center justify-center gap-[7px] py-[13px]">
            <AuraIcon name="personPlus" size={19} color="#0A3B2C" />
            <Text className="font-fredoka-700 text-[16px]" style={{ color: '#0A3B2C' }}>
              Add friends
            </Text>
          </View>
        </ToyShadow>
      </View>
    </View>
  );
}

/* One event.

   ## The disc

   On your own rows it's the poll's emoji, ringed in the sender's gender colour. Both facts are free on
   the card and both were being thrown away: the ring still says girl/boy at colour-speed, and the
   emoji is what stops forty rows looking like one row repeated. Friend rows keep the plain gender disc
   with the aura mark, because a friend row deliberately carries no superlative to draw.

   ## Weight

   Your own rows sit a shade lighter than your friends'. A card you've never opened gets a pink dot
   instead of the chevron — the only unread treatment in the feed, and wordless on purpose: an
   explanatory "tap to flip" would be describing the control next to it (see the copy rule in
   CLAUDE.md). Nothing else is emphasised. Two thirds of a feed visibly marked as the boring rows is a
   scoreboard, not a feed. */
function ActivityRow({ item, onPress }: { item: ActivityItem; onPress?: () => void }) {
  const mine = item.kind === 'pick';
  const isFriend = item.kind === 'friend';
  const isNote = item.kind === 'note';
  const isMilestone = item.kind === 'milestone';
  /* A milestone is about a friend, not about a voter, so it has no gender to colour by. Streaks take
     the flame's orange and superlative wins take yellow — the two colours those things already are
     elsewhere in the app (the streak pill, and a trophy chip on a profile). */
  const accent = isMilestone
    ? item.milestone === 'streak'
      ? '#FF7A3D'
      : '#FFD84D'
    : isNote
      ? TRACK
      : GENDER_ACCENT[item.gender] ?? UNKNOWN_ACCENT;

  const body = (
    <View
      className="flex-row items-center gap-[11px] rounded-18 px-[13px] py-[11px]"
      /* Your rows are coloured by whoever sent the vote; everyone else's stay the default grey.

         Two jobs from one decision. It still separates your aura from your friends' at a glance — the
         thing a single step of grey (#4A474B against #3C393E) never did, and that the wording stopped
         doing once friend rows gained their prompt too. But it also makes the colour *mean* something
         instead of just marking ownership: the row is pink, blue or mint for the same reason the disc
         inside it is, so a feed skimmed at arm's length already says who's been picking you.

         Which is also why a single fixed colour was the wrong idea twice over — lavender marked the
         row as yours and said nothing else, and it had to borrow a hue that means "protected sender"
         on the Cards tab to do it.

         Edge-lit, not washed: dark tinted ground with the bright accent on the rim. That's the
         treatment the protected cards use (TRACK behind, bright rim around — see AuraCardFace) and the
         reason they read as lit rather than painted. A saturated fill gets none of it.

         Every row carries the border and the non-yours ones make it transparent. Toggling `borderWidth`
         instead would shift each row's contents by 1.5px depending on whose it was — RN borders are
         inside the box. */
      style={{
        backgroundColor: mine ? GENDER_GROUND[item.gender] ?? UNKNOWN_GROUND : '#3C393E',
        borderWidth: 1.5,
        borderColor: mine ? accent : 'transparent'
      }}
    >
      {mine || isFriend ? (
        /* Emoji on the card ground, ringed in the accent — rather than emoji *on* the accent, where a
           yellow prompt on a pink disc is two bright fills fighting and the glyph stops reading.

           Friend rows use this too now. They kept the plain aura mark only because they had no prompt
           to draw; they have one, and forty rows of the same glyph was exactly the sameness the emoji
           exists to break up. */
        <View
          className="items-center justify-center"
          style={{ width: 34, height: 34, borderRadius: 99, backgroundColor: '#2C2A2D', borderWidth: 2, borderColor: accent }}
        >
          <Text style={{ fontSize: 15 }}>{item.emoji || '✨'}</Text>
        </View>
      ) : (
        <View
          className="items-center justify-center"
          style={{ width: 34, height: 34, borderRadius: 99, backgroundColor: accent }}
        >
          {isNote ? (
            <Text style={{ fontSize: 16 }}>{item.emoji || '🔔'}</Text>
          ) : isMilestone ? (
            item.milestone === 'streak' ? (
              <AuraIcon name="flame" size={18} color="#221F22" />
            ) : (
              <Text style={{ fontSize: 15 }}>{item.emoji || '🏆'}</Text>
            )
          ) : (
            /* Dark ink on the accent rather than white — the gender colours are bright enough that a
               white mark on mint disappears. Same value the split bar's chips use. */
            <AuraIcon name="aura" size={17} color="#221F22" filled />
          )}
        </View>
      )}
      <View className="min-w-0 flex-1">
        {/* Two lines, then ellipsis. The prompts run long — "The girl every guy wants to date & the
            guy every girl wants to date" is a real one — and at full length a single row takes three
            lines and pushes the next event off the screen, which is the opposite of a feed you skim.
            Nothing is lost: the card this row opens prints the prompt in full. */}
        <Text numberOfLines={2} className="font-nunito-900 text-[13px] leading-[17px] text-white">
          {isNote
            ? item.text
            : isMilestone
              ? milestoneLine(item)
              : mine
                ? pickLine(item.gender, item.name, item.q)
                : auraLine(item.gender, item.friendName, item.q)}
        </Text>
        <View className="flex-row items-center gap-[6px]">
          <Text className="font-nunito-700 mt-[2px] text-[11.5px]" style={{ color: '#848286' }}>
            {relativeTime(item.ts)}
          </Text>
          {/* The one row out of that sender's set that gets to say it — see `repeat` in auraTab. Pink
              because it's the line the tab is named for, and the only coloured text in the feed. */}
          {mine && item.repeat && (
            <Text className="font-nunito-900 mt-[2px] text-[11.5px]" style={{ color: '#FF5CA8' }}>
              {repeatChip(item.pickCount)}
            </Text>
          )}
        </View>
      </View>
      {/* A card you've never opened shows a dot instead. Only where there's somewhere to go — a
          chevron on a notification row would promise a screen that doesn't exist. */}
      {mine && item.fresh ? (
        <View style={{ width: 9, height: 9, borderRadius: 99, backgroundColor: '#FF5CA8' }} />
      ) : (
        onPress && <AuraIcon name="chevronRight" size={16} color="#6E6B71" />
      )}
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
       the "mutation in an Effect" smell the house rules call out (see CLAUDE.md).

       Fire-and-forget; navigation doesn't wait on it. See useMarkAuraOpened. */
    const markOpened = () => markAuraOpened.mutate(f.id);

    // An open card reopens its own reveal. It used to go to a separate deck screen; that's gone, and
    // the card itself is the record of the flip anyway.
    if (f.name) return router.push({ pathname: '/flip', params: { id: f.id } });
    if (f.anonymous) {
      markOpened();
      return router.push({ pathname: '/flip', params: { id: f.id } });
    }
    /* A non-member used to be diverted straight to /infinite from here, never seeing the card at all.
       That sold the upgrade to someone who had been shown nothing — the pitch arrived before the thing
       it was pitching about. Now they get the same screen everyone else gets: their card, face down, at
       full size, with everything that's free on it (emoji, gender, grade, how many times that sender
       picked them) and a live Flip button under it. The paywall opens when they press it — at the
       moment they've decided they want the name, rather than before they knew there was one.

       Which is also why marking it opened is honest now and wasn't before: they really do see it. */
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
/* The card, and nothing under it.

   Two InfoCards used to sit below: a bell one promising a notification the moment someone picks you,
   and a mail one saying more classmates means more people who can pick you. Both went.

   The bell line restated the body directly above it — "this fills up without warning" already says you
   don't have to sit here watching — and it made a promise about push notifications on a screen that
   can't know whether they're even enabled. The mail line was the friends promo without the button, and
   the promo is now on this screen carrying it properly.

   That also retires the `showClassmatesTip` prop: it existed to hide the mail card when the promo was
   above it, and there's no card left to hide. */
function AuraEmpty({ onVote }: { onVote: () => void }) {
  return (
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
  );
}
