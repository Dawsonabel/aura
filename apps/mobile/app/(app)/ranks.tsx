import { useState } from 'react';
import { Pressable, ScrollView, Share, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBoard, type BoardEntry, type BoardScope } from '../../src/hooks/useBoard';
import { useMe } from '../../src/hooks/useMe';
import { ToyShadow } from '../../src/components/ToyShadow';
import { EmptyState, InlineFailure, SkeletonBlock, SkeletonRows } from '../../src/components/stateKit';
import { InfoCard } from '../../src/components/settingsKit';
import { AuraIcon } from '../../src/components/AuraIcon';

/* README §5 / 12A — the Ranks board.

   Scopes, decided with the product owner: Overall is this week, My grade is this week restricted to
   your grade, and Hottest is the last 24 hours (there is no "hottest" prompt in the poll library, so
   the chip is a *window* rather than a question).

   Blocked people keep their rank and score and lose their name — 8A's rule, applied server-side so
   the client never receives the identity it isn't allowed to show. */

const CHIPS: { scope: BoardScope; label: string }[] = [
  { scope: 'overall', label: 'Overall' },
  { scope: 'grade', label: 'My grade' },
  { scope: 'trending', label: 'Hottest' }
];

// Rank rows 4+ cycle these, per the design's "yellow → mint → pink → purple" avatar rule.
const ROW_ACCENTS = [
  { bg: '#FFD84D', ink: '#3A2A00' },
  { bg: '#6BF2C2', ink: '#0A3B2C' },
  { bg: '#FF5CA8', ink: '#FFFFFF' },
  { bg: '#7C6CF5', ink: '#FFFFFF' }
];
const BLOCKED_ACCENT = { bg: '#524F53', ink: '#B0AEB2' };
// Podium fills are fixed by the design: 2nd mint, 1st pink, 3rd purple.
const PODIUM_ACCENTS = [
  { bg: '#6BF2C2', ink: '#0A3B2C' },
  { bg: '#FF5CA8', ink: '#FFFFFF' },
  { bg: '#7C6CF5', ink: '#FFFFFF' }
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

function gradeLabel(grade: string | null): string | null {
  if (!grade) return null;
  return /^\d+$/.test(grade) ? `${grade}th` : grade;
}

/* "⏳ 2d left". Derived from the server's resetsAt rather than computed locally, so every device
   agrees on when the week ends even if their clocks or timezones don't. */
function timeLeft(resetsAt: string): string {
  const ms = new Date(resetsAt).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return 'resetting';
  const days = Math.floor(ms / 86400_000);
  if (days >= 1) return `${days}d left`;
  const hours = Math.floor(ms / 3600_000);
  if (hours >= 1) return `${hours}h left`;
  return `${Math.max(1, Math.floor(ms / 60_000))}m left`;
}

export default function Ranks() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [scope, setScope] = useState<BoardScope>('overall');
  const { data, isLoading, isError, refetch } = useBoard(scope);
  const { data: me } = useMe();

  const podium = data ? data.entries.slice(0, 3) : [];
  const rest = data ? data.entries.slice(3) : [];

  /* 13A: a row opens that person's public profile. Blocked rows and your own stay inert — 8A is
     explicit that a blocked row can't be tapped, and your own profile is the Me tab. */
  const openProfile = (userId: string) => router.push({ pathname: '/u', params: { userId } });

  return (
    <View className="flex-1 bg-ground px-[21px]" style={{ paddingTop: insets.top + 14 }}>
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="font-fredoka-700 text-[36px] leading-[38px] text-white">The board</Text>
          <Text className="font-nunito-700 mt-[6px] text-[14px] text-ink-muted">
            {scope === 'trending'
              ? `Most aura${me?.school?.name ? ` at ${me.school.name}` : ''} today`
              : `Most aura${me?.school?.name ? ` at ${me.school.name}` : ''} this week`}
          </Text>
        </View>
        {/* Pill must not shrink or wrap (README §5). */}
        {data && (
          <View style={{ flexGrow: 0, flexShrink: 0 }}>
            <ToyShadow depth={3} shadowColor="#C4501E" backgroundColor="#F2703A" radius={9999}>
              <View className="flex-row items-center gap-[5px] px-3 py-[6px]">
                <AuraIcon name="hourglass" size={13} color="#FFFFFF" />
                <Text className="font-nunito-900 text-[12px] text-white">{timeLeft(data.resetsAt)}</Text>
              </View>
            </ToyShadow>
          </View>
        )}
      </View>

      <View className="mt-[18px] flex-row gap-2">
        {CHIPS.map(chip => {
          const active = chip.scope === scope;
          return (
            <Pressable
              key={chip.scope}
              onPress={() => setScope(chip.scope)}
              className="rounded-pill px-[15px] py-2"
              style={{ backgroundColor: active ? '#6BF2C2' : '#403E41' }}
            >
              <Text
                className={active ? 'font-nunito-900 text-[13px]' : 'font-nunito-800 text-[13px]'}
                style={{ color: active ? '#0A3B2C' : '#C1C0C0' }}
              >
                {chip.label}
              </Text>
            </Pressable>
          );
        })}
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
            title="The board didn't load"
            body="Everything else works. This one just didn't come back."
            onRetry={() => refetch()}
          />
        </View>
      ) : isLoading || !data ? (
        <BoardSkeleton />
      ) : data.entries.length === 0 ? (
        <View className="mt-5">
          <EmptyState
            icon="trophy"
            title="Nobody's on the board yet"
            body={
              scope === 'trending'
                ? 'No aura yet today. The first picks put the first names up.'
                : `This week starts at zero for everyone${me?.school?.name ? ` at ${me.school.name}` : ''}. The first picks put the first names up.`
            }
            ctaLabel="Vote in today's round"
            onCta={() => router.replace('/aura')}
          />
          <View className="mt-4">
            <InfoCard icon="clock">
              The board resets every Sunday night, so an early week always looks thin.
            </InfoCard>
          </View>
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
                  accentIndex={i}
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
            {rest.length > 0 && (
              <Text className="font-nunito-800 text-center text-[12.5px] text-ink-faint">· · ·</Text>
            )}
          </View>
        </ScrollView>
      )}

      {/* Pinned, always pink, never scrolls — the one pink element on the screen. Rendered even at
          rank 0 so the screen always answers "where am I?", which is the point of the board. Hidden
          while locked: there is no rank to show, and the unlock card is the whole message. */}
      {data && data.unlocked && !isError && <YourRank entry={data.me} flamesToTopTen={data.flamesToTopTen} />}
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

function PodiumCard({
  entry,
  first,
  accentIndex,
  onPress
}: {
  entry: BoardEntry;
  first: boolean;
  accentIndex: number;
  onPress?: () => void;
}) {
  const accent = entry.blocked ? BLOCKED_ACCENT : PODIUM_ACCENTS[accentIndex] ?? PODIUM_ACCENTS[0];
  const rankLabel = entry.rank === 1 ? '1ST' : entry.rank === 2 ? '2ND' : '3RD';

  return (
    <View style={{ flex: first ? 1.14 : 1 }}>
      <ToyShadow depth={first ? 6 : 4} shadowColor="#D9C7AF" backgroundColor="#FFF6E8" radius={first ? 24 : 22} onPress={onPress}>
        <View className={first ? 'items-center px-2 py-[18px]' : 'items-center px-2 py-[14px]'} style={{ position: 'relative' }}>
          {first && (
            <View
              className="rounded-pill bg-yellow px-[11px] py-1"
              style={{ position: 'absolute', top: -13, transform: [{ rotate: '-3deg' }] }}
            >
              <Text className="font-nunito-900 text-[11px]" style={{ color: '#3A2A00' }}>
                👑 THE ONE
              </Text>
            </View>
          )}
          <View
            className="items-center justify-center rounded-pill"
            style={{
              width: first ? 56 : 46,
              height: first ? 56 : 46,
              backgroundColor: accent.bg,
              marginTop: first ? 4 : 0
            }}
          >
            {entry.blocked ? (
              <AuraIcon name="block" size={first ? 22 : 19} color="#8B888D" />
            ) : (
              <Text className="font-fredoka-700" style={{ fontSize: first ? 21 : 17, color: accent.ink }}>
                {initials(entry.name)}
              </Text>
            )}
          </View>
          <Text
            className="font-nunito-900 mt-[6px] text-center"
            style={{ fontSize: first ? 15 : 14, color: entry.blocked ? '#8B888D' : '#2D2A2E' }}
            numberOfLines={1}
          >
            {entry.name}
          </Text>
          <Text className="font-fredoka-700" style={{ fontSize: first ? 26 : 20, color: '#2D2A2E' }}>
            {entry.flames}
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
  const accent = entry.blocked ? BLOCKED_ACCENT : ROW_ACCENTS[entry.rank % ROW_ACCENTS.length];
  const meta = entry.blocked ? 'You blocked this person' : gradeLabel(entry.grade);
  const Row = onPress ? Pressable : View;

  return (
    <Row onPress={onPress} className="flex-row items-center gap-[13px] rounded-20 bg-surface px-[15px] py-[13px]">
      <Text className="font-fredoka-700 text-[17px] text-ink-dim" style={{ width: 26 }}>
        {entry.rank}
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
      <Text className="font-nunito-900 text-[15px] text-ink-secondary">{entry.flames}</Text>
    </Row>
  );
}

/* The pinned row. 10A's empty-board variant is the same card gone grey with an em dash instead of a
   rank — never a fake #1 for someone with no aura. */
function YourRank({ entry, flamesToTopTen }: { entry: BoardEntry | null; flamesToTopTen: number | null }) {
  const flames = entry?.flames ?? 0;
  const ranked = entry !== null;

  const subtitle = !ranked
    ? 'Any aura at all is enough to get ranked'
    : flamesToTopTen !== null
      ? `${flamesToTopTen} more aura cracks the top 10`
      : "You're in the top 10";

  const card = (
    <View className="flex-row items-center gap-[14px] px-[19px] py-[17px]">
      <Text
        className="font-fredoka-700 text-[30px]"
        style={{ color: ranked ? '#FFFFFF' : '#727074' }}
      >
        {ranked ? entry.rank : '—'}
      </Text>
      <View className="flex-1">
        <Text className="font-nunito-900 text-[15px]" style={{ color: ranked ? '#FFFFFF' : '#C1C0C0' }}>
          You · {flames} aura
        </Text>
        <Text className="font-nunito-800 mt-[2px] text-[12.5px]" style={{ color: ranked ? '#FFD6E9' : '#848286' }}>
          {subtitle}
        </Text>
      </View>
      {ranked && <AuraIcon name="trophy" size={24} color="#6BF2C2" />}
    </View>
  );

  if (!ranked) {
    return <View className="mb-3 mt-[18px] rounded-24 bg-surface">{card}</View>;
  }
  return (
    <View className="mb-3 mt-[18px]">
      <ToyShadow depth={5} shadowColor="#C43A7C" backgroundColor="#FF5CA8" radius={24}>
        {card}
      </ToyShadow>
    </View>
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
