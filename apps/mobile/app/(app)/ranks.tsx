import { useState } from 'react';
// Pressable is used as a value, not a tag — `const Row = onPress ? Pressable : View` in RankRow.
import { Pressable, ScrollView, Share, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBoard, type BoardEntry, type BoardScope } from '../../src/hooks/useBoard';
import { useMe } from '../../src/hooks/useMe';
import { ToyShadow } from '../../src/components/ToyShadow';
import { EmptyState, InlineFailure, SkeletonBlock, SkeletonRows } from '../../src/components/stateKit';
import { InfoCard } from '../../src/components/settingsKit';
import { AuraIcon } from '../../src/components/AuraIcon';
import { PeriodBar } from '../../src/components/auraKit';
import { ordinalSuffix } from '../../src/lib/auraTab';
import { avatarAccent } from '../../src/components/profileKit';

/* README §5 / 12A — the Ranks board.

   Scopes, decided with the product owner: Overall is this week, My grade is this week restricted to
   your grade, and Trending is the last 24 hours — a *window*, not a question. It read "Hottest" until
   the rename, which invited exactly the confusion the parenthetical was there to head off: the poll
   library has prompts of that kind, and a tab named after one looks like it filters to it.

   Blocked people keep their rank and score and lose their name — 8A's rule, applied server-side so
   the client never receives the identity it isn't allowed to show. */

/* `key`, not `scope`, because these feed PeriodBar — the same segmented control the Aura tab's
   Activity/Cards/Receipt row and the Receipt's period switch use. Three loose pills read as filters
   you apply *to* a board; a segmented track reads as three boards you move between, which is what
   these actually are (different windows and different populations, not a subset of one list).

   'Trending' rather than 'Hottest': the scope is the last 24 hours, and the poll library has no
   "hottest" prompt for it to be confused with. */
const SCOPES: { key: BoardScope; label: string }[] = [
  { key: 'overall', label: 'Overall' },
  { key: 'grade', label: 'My grade' },
  { key: 'trending', label: 'Trending' }
];

/* Avatars are coloured by `avatarAccent(userId)` — profileKit's hash — same as the profile, People,
   report and vote screens.

   This screen used to own two private palettes instead: the podium was fixed (2nd mint, 1st pink, 3rd
   purple) and rows 4+ cycled yellow → mint → pink → purple on `rank % 4`. Both were keyed to
   *position*, which produced two problems. Liam Chen was pink here and purple on his own profile,
   because first place is always pink whoever holds it. And a row's colour was a function of its rank,
   so somebody else gaining a vote recoloured you — a face changing colour while you watch it.

   The cost, accepted deliberately: the podium's designed mint/pink/purple is gone, and three people
   who hash to the same colour will now sit next to each other on it. A person having one face
   everywhere is worth more than three cards being reliably different from each other. */
const BLOCKED_ACCENT = { bg: '#524F53', ink: '#B0AEB2' };

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

function gradeLabel(grade: string | null): string | null {
  if (!grade) return null;
  return /^\d+$/.test(grade) ? `${grade}th` : grade;
}

/* "2d", "5h", "45m". Derived from the server's resetsAt rather than computed locally, so every device
   agrees on when the week ends even if their clocks or timezones don't.

   Bare units, no "left": the pill reads "This week · 5h" now, and the window it's attached to already
   makes it a remainder. Spelling it out cost four characters the header does not have — with them the
   title wrapped to "Leaderboar / d", and the pill is the element that must not shrink (README §5). */
function timeLeft(resetsAt: string): string {
  const ms = new Date(resetsAt).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return 'resetting';
  const days = Math.floor(ms / 86400_000);
  if (days >= 1) return `${days}d`;
  const hours = Math.floor(ms / 3600_000);
  if (hours >= 1) return `${hours}h`;
  return `${Math.max(1, Math.floor(ms / 60_000))}m`;
}

export default function Ranks() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [scope, setScope] = useState<BoardScope>('overall');
  const { data, isLoading, isError, refetch } = useBoard(scope);
  const { data: me } = useMe();

  const podium = data ? data.entries.slice(0, 3) : [];
  const rest = data ? data.entries.slice(3) : [];

  /* The countdown outlives the query it arrived on.

     `useBoard(scope)` keys on the scope, so every tap on the segment bar is a different query: `data`
     goes undefined, and the pill — gated on `data` — unmounted and remounted on each switch. It read
     as the deadline reloading, which it never does. `resetsAt` is `weekEnd(now)` computed before
     boardFor branches on scope (apps/api/src/board.ts), so all three tabs return the same instant and
     re-fetching it can only ever produce the value already on screen.

     Held in state compared during render rather than in an Effect — the house pattern, see the frozen
     notification list in inbox.tsx. An Effect would cost an extra render pass and still blink once.

     Deliberately only the pill. The standings genuinely differ per scope, so the board below keeps its
     skeleton; blanking a list that's about to change is honest, and keeping the previous scope's rows
     up during the swap would be showing the wrong people under the right tab. */
  const [resetsAt, setResetsAt] = useState<string | null>(null);
  if (data && data.resetsAt !== resetsAt) setResetsAt(data.resetsAt);

  /* 13A: a row opens that person's public profile. Blocked rows and your own stay inert — 8A is
     explicit that a blocked row can't be tapped, and your own profile is the Me tab. */
  const openProfile = (userId: string) => router.push({ pathname: '/u', params: { userId } });

  return (
    <View className="flex-1 bg-ground px-[21px]" style={{ paddingTop: insets.top + 14 }}>
      <View className="flex-row items-start justify-between gap-3">
        {/* Title only. The subtitle read "Most aura at Lincoln High this week" — a sentence describing
            the three things directly under it: the scope chips say which cut you're on, the podium says
            it's a most-aura ranking, and the pill beside it says the window. */}
        {/* The window moved into the title, which is where it stops being a caption and becomes the
            name of the thing. "Ranks" rather than "Leaderboard" is what lets it back onto one line —
            it's five characters shorter, and it's what the tab is called anyway.

            numberOfLines guards the pill's no-shrink rule (README §5): if the title ever outgrows the
            room beside it, it truncates rather than wrapping underneath. */}
        <View className="flex-1">
          <Text numberOfLines={1} className="font-fredoka-700 text-[36px] leading-[38px] text-white">
            {scope === 'trending' ? 'Daily' : 'Weekly'} Ranks
          </Text>
        </View>
        {/* Purely a timer now — clock and a duration, nothing naming the window. The title carries
            that, so the pill saying it too was the same fact twice.

            Absent on Daily, and that's not an oversight. `resetsAt` is the week's end on every scope
            (board.ts computes it before it branches), while Trending reads a *rolling* 24 hours — so a
            countdown there would either tick toward a reset that doesn't apply to it, or claim a
            deadline a rolling window doesn't have. Nothing true to show, so it shows nothing.

            Must not shrink or wrap (README §5). Keyed off the remembered `resetsAt` so it survives a
            scope change — see the note above. */}
        {scope !== 'trending' && resetsAt && (
          <View style={{ flexGrow: 0, flexShrink: 0 }}>
            <ToyShadow depth={3} shadowColor="#C4501E" backgroundColor="#F2703A" radius={9999}>
              <View className="flex-row items-center gap-[5px] px-3 py-[6px]">
                <AuraIcon name="clock" size={13} color="#FFFFFF" />
                <Text className="font-nunito-900 text-[12px] text-white">{timeLeft(resetsAt)}</Text>
              </View>
            </ToyShadow>
          </View>
        )}
      </View>

      <View className="mt-[14px]">
        {/* 16.5 — level with the Aura tab's Activity/Cards/Receipt bar, since this plays the same
            role. See `textSize` in PeriodBar for why it isn't the component's default. */}
        <PeriodBar value={scope} options={SCOPES} onChange={setScope} textSize={16.5} />
      </View>

      {/* Locked until the school has enough people for a leaderboard to mean anything. The server
          sends no standings at all while locked, so there is nothing here to accidentally reveal. */}
      {data && !data.unlocked && !isError ? (
        <BoardLocked
          memberCount={data.memberCount}
          threshold={data.unlockThreshold}
          schoolName={me?.school?.name ?? null}
        />
      ) : isError ? (
        <View className="mt-5">
          <InlineFailure
            icon="trophy"
            title="The leaderboard didn't load"
            body="Everything else works. This one just didn't come back."
            onRetry={() => refetch()}
          />
        </View>
      ) : isLoading || !data ? (
        <BoardSkeleton />
      ) : data.entries.length === 0 ? (
        /* Title and button, nothing between them.

           The body ("The first picks put the first names up") explained the empty board using the
           button directly beneath it, and the info card under that — "resets every Sunday night, so
           an early week always looks thin" — was worse than redundant: it was wrong on this scope.
           Trending is a rolling day and never sees a Sunday reset, so the one card claiming to
           explain the emptiness was describing a different board. */
        <View className="mt-5">
          <EmptyState
            icon="trophy"
            title="Nobody's on the board yet"
            ctaLabel="Vote in today's round"
            onCta={() => router.replace('/aura')}
          />
        </View>
      ) : (
        <ScrollView className="mt-5" showsVerticalScrollIndicator={false}>
          {/* Podium order is 2nd · 1st · 3rd, and the middle card is taller — hence the index dance. */}
          <View className="flex-row items-end gap-[9px]">
            {[podium[1], podium[0], podium[2]].map((entry, i) =>
              entry ? (
                <PodiumCard
                  key={entry.userId}
                  entry={entry}
                  first={i === 1}
                  onPress={entry.blocked || entry.userId === me?.id ? undefined : () => openProfile(entry.userId)}
                />
              ) : (
                <View key={i} className="flex-1" />
              )
            )}
          </View>

          <View className="mt-[18px] gap-2">
            {rest.map(entry => (
              <RankRow
                key={entry.userId}
                entry={entry}
                isMe={entry.userId === me?.id}
                onPress={entry.blocked || entry.userId === me?.id ? undefined : () => openProfile(entry.userId)}
              />
            ))}
            {/* A rule, not an ellipsis. Three dots read as a control — the "…" that expands a list or
                opens a menu — so the end of the board looked tappable and like it was withholding
                rows. A flat line is punctuation: it stops, and offers nothing. */}
            {rest.length > 0 && (
              <View className="items-center pt-[7px]">
                <View style={{ width: 34, height: 2, borderRadius: 2, backgroundColor: '#727074' }} />
              </View>
            )}
          </View>
        </ScrollView>
      )}

      {/* The pinned "You · N aura" card stood here — always pink, never scrolling, rendered even at
          rank 0 so the screen always answered "where am I?".

          Removed on request. Worth knowing what went with it: the board sends ten rows, and `me` was
          how someone outside those ten learned their own standing. Below the tier the screen now says
          nothing about you at all. `board.me` and `aurasToTopTen` are still served, so putting it back
          is a UI change only. */}
    </View>
  );
}

/* The cold-start state. A school under the threshold gets the count, a progress bar and the one
   action that moves it — inviting people. No standings, because there aren't meaningfully any.

   The invite is a plain OS share sheet with a text message, not a tracked invite link: there is no
   invite/attribution system yet (see DESIGN-REQUESTS §3.2 and §6.1), and a fake "invite code" would
   promise attribution the backend can't honour. */
function BoardLocked({
  memberCount,
  threshold,
  schoolName
}: {
  memberCount: number;
  threshold: number;
  schoolName: string | null;
}) {
  const remaining = Math.max(0, threshold - memberCount);
  const pct = Math.min(100, Math.round((memberCount / threshold) * 100));
  const where = schoolName ?? 'your school';

  async function invite() {
    try {
      await Share.share({
        message: `come vote on Aura — it's anonymous and it's just ${where}. we need ${remaining} more people to unlock the board 🔥`
      });
    } catch {
      // The user dismissing the share sheet throws on some platforms; nothing to report.
    }
  }

  return (
    <ScrollView className="mt-5" showsVerticalScrollIndicator={false}>
      <ToyShadow depth={6} shadowColor="#D9C7AF" backgroundColor="#FFF6E8" radius={26}>
        <View className="items-center px-5 py-6">
          <AuraIcon name="lock" size={40} color="#8B888D" />
          <Text className="font-fredoka-700 mt-3 text-center text-[23px] leading-[26px]" style={{ color: '#2D2A2E' }}>
            {remaining} more to unlock the board
          </Text>
          <Text className="font-nunito-700 mt-2 text-center text-[13.5px] leading-[19px]" style={{ color: '#8B888D' }}>
            A ranking of a handful of people is just a list of everyone. At {threshold} it starts being a
            real board — and big enough that nobody can work out who voted for who.
          </Text>

          {/* Progress, in the cream card's own palette rather than mint — this is a status, not a CTA. */}
          <View className="mt-4 w-full">
            <View className="h-[10px] w-full overflow-hidden rounded-pill" style={{ backgroundColor: '#E4D6BF' }}>
              <View className="h-full rounded-pill" style={{ width: `${pct}%`, backgroundColor: '#FF5CA8' }} />
            </View>
            <View className="mt-2 flex-row justify-between">
              <Text className="font-nunito-900 text-[12.5px]" style={{ color: '#2D2A2E' }}>
                {memberCount} at {where}
              </Text>
              <Text className="font-nunito-800 text-[12.5px]" style={{ color: '#8B888D' }}>
                {threshold} to unlock
              </Text>
            </View>
          </View>

          <View className="mt-4 w-full">
            <ToyShadow depth={4} shadowColor="#C43A7C" backgroundColor="#FF5CA8" radius={9999} onPress={invite}>
              <View className="items-center py-[15px]">
                <View className="flex-row items-center gap-2">
                    <AuraIcon name="mail" size={18} color="#FFFFFF" />
                    <Text className="font-fredoka-700 text-[17px] text-white">Invite your class</Text>
                  </View>
              </View>
            </ToyShadow>
          </View>
        </View>
      </ToyShadow>

      <View className="mt-4 gap-[9px]">
        <InfoCard icon="aura">
          Voting and aura work right now — the board is the only thing waiting. Every round you play
          puts you in more people's polls.
        </InfoCard>
        {/* Deliberately not phrased as "under {threshold}" — the anonymity floor is per cohort (how
            many share a gender *and* grade), not the school total, so tying it to this number would
            overclaim in one direction and underclaim in the other. */}
        <InfoCard icon="eyeOff">
          A pick only mentions someone's grade and gender when enough people at your school share both.
          Until then it just says someone at your school picked you.
        </InfoCard>
      </View>
    </ScrollView>
  );
}

/* Three sizes, not two. First and second used to share one "not first" size with third, so the podium
   read as a winner plus two runners-up rather than as a ranking — the shape said 1, 2, 2.

   Every dimension steps down together (width, height, corner, shadow depth, avatar, type), because
   changing only one reads as a mistake rather than as a tier. Keyed off `entry.rank` rather than the
   render position: the row draws 2nd · 1st · 3rd, so position and place deliberately disagree here and
   the rank is the honest source.

   `pad` is the one value that isn't monotonic, and that's not a typo. First place is the only card
   carrying a crown, which adds ~22px of height nothing else pays, so its padding comes *down* to
   absorb that — otherwise the crown and the padding stack and first place towers. What's being tuned
   is the finished height of each card, not the padding in isolation. */
const PODIUM_SIZE: Record<number, { flex: number; depth: number; radius: number; pad: number; avatar: number; initials: number; name: number; score: number }> = {
  1: { flex: 1.12, depth: 6, radius: 24, pad: 12, avatar: 54, initials: 20, name: 15, score: 24 },
  2: { flex: 1.06, depth: 5, radius: 23, pad: 17, avatar: 52, initials: 19, name: 14.5, score: 23 },
  3: { flex: 1.0, depth: 4, radius: 22, pad: 15, avatar: 48, initials: 18, name: 14, score: 21 }
};

function PodiumCard({
  entry,
  first,
  onPress
}: {
  entry: BoardEntry;
  first: boolean;
  onPress?: () => void;
}) {
  const accent = entry.blocked ? BLOCKED_ACCENT : avatarAccent(entry.userId);
  const rankLabel = entry.rank === 1 ? '1ST' : entry.rank === 2 ? '2ND' : '3RD';
  const size = PODIUM_SIZE[entry.rank] ?? PODIUM_SIZE[3];

  return (
    <View style={{ flex: size.flex }}>
      <ToyShadow depth={size.depth} shadowColor="#D9C7AF" backgroundColor="#FFF6E8" radius={size.radius} onPress={onPress}>
        <View className="items-center px-2" style={{ paddingVertical: size.pad }}>
          {/* The crown sits in normal flow above the avatar rather than absolutely over it. The
              retired "👑 THE ONE" tag was positioned at `top: -13`, outside the card, and got clipped
              by the row it lived in — anything hung off this card's top edge has the same problem. In
              flow it can't clip, and a crown resting on the head is the read anyway.

              28px glyph occupying 22px of layout: the negative top margin lets it grow *upward* into
              the card's own 12px of top padding instead of pushing the card taller. It ends up 6px
              below the card's top edge — inside it, so still nothing to clip. Any future size bump
              has to move `marginTop` with it or the podium heights drift apart again. */}
          {first && !entry.blocked && (
            <View style={{ marginTop: -6 }}>
              <AuraIcon name="crown" size={28} color="#FFD84D" />
            </View>
          )}
          <View
            className="items-center justify-center rounded-pill"
            style={{ width: size.avatar, height: size.avatar, backgroundColor: accent.bg }}
          >
            {entry.blocked ? (
              <AuraIcon name="block" size={Math.round(size.avatar * 0.4)} color="#8B888D" />
            ) : (
              <Text className="font-fredoka-700" style={{ fontSize: size.initials, color: accent.ink }}>
                {initials(entry.name)}
              </Text>
            )}
          </View>
          <Text
            className="font-nunito-900 mt-[6px] text-center"
            style={{ fontSize: size.name, color: entry.blocked ? '#8B888D' : '#2D2A2E' }}
            numberOfLines={1}
          >
            {entry.name}
          </Text>
          <Text className="font-fredoka-700" style={{ fontSize: size.score, color: '#2D2A2E' }}>
            {entry.auras}
          </Text>
          <Text className="font-nunito-900 text-[11px]" style={{ color: '#8B888D' }}>
            {rankLabel}
          </Text>
        </View>
      </ToyShadow>
    </View>
  );
}

function RankRow({ entry, isMe, onPress }: { entry: BoardEntry; isMe: boolean; onPress?: () => void }) {
  const accent = entry.blocked ? BLOCKED_ACCENT : avatarAccent(entry.userId);
  const meta = entry.blocked ? 'You blocked this person' : gradeLabel(entry.grade);
  const Row = onPress ? Pressable : View;

  return (
    <Row onPress={onPress} className="flex-row items-center gap-[13px] rounded-20 bg-surface px-[15px] py-[13px]">
      {/* "4th", not "4" — the podium above says 1ST/2ND/3RD, so a bare numeral here read as a
          different kind of value (a count, a score) rather than as the continuation of that sequence.
          Wider than the old 26 to hold "10th" without the suffix wrapping under the number. */}
      <Text className="font-fredoka-700 text-[17px] text-ink-dim" style={{ width: 40 }}>
        {entry.rank}
        {ordinalSuffix(entry.rank)}
      </Text>
      <View className="h-[38px] w-[38px] items-center justify-center rounded-pill" style={{ backgroundColor: accent.bg }}>
        {entry.blocked ? (
          <AuraIcon name="block" size={17} color="#8B888D" />
        ) : (
          <Text className="font-fredoka-700 text-[14px]" style={{ color: accent.ink }}>
            {initials(entry.name)}
          </Text>
        )}
      </View>
      <View className="flex-1">
        <Text
          className="font-nunito-900 text-[15px]"
          style={{ color: entry.blocked ? '#8B888D' : '#FFFFFF' }}
          numberOfLines={1}
        >
          {isMe ? 'You' : entry.name}
        </Text>
        {meta ? (
          <Text className="font-nunito-700 mt-[2px] text-[12.5px]" style={{ color: entry.blocked ? '#727074' : '#848286' }}>
            {meta}
          </Text>
        ) : null}
      </View>
      <Text className="font-nunito-900 text-[15px] text-ink-secondary">{entry.auras}</Text>
    </Row>
  );
}

/* 10A's ranks skeleton: the podium keeps its 2-1-3 heights so the layout doesn't jump when data
   lands, and the chips above are real, so only the data regions block out. */
function BoardSkeleton() {
  return (
    <View className="mt-5">
      <View className="flex-row items-end gap-[9px]">
        <View className="flex-1">
          <SkeletonBlock height={132} radius={22} index={0} />
        </View>
        <View style={{ flex: 1.14 }}>
          <SkeletonBlock height={158} radius={24} index={1} />
        </View>
        <View className="flex-1">
          <SkeletonBlock height={132} radius={22} index={2} />
        </View>
      </View>
      <View className="mt-[18px]">
        <SkeletonRows n={4} height={64} radius={20} avatarSize={38} avatarRadius={100} />
      </View>
    </View>
  );
}
