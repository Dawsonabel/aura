import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSchoolmates, type Schoolmate } from '../../src/hooks/useSchoolmates';
import { useBlockedPeople } from '../../src/hooks/useBlockedPeople';
import { useMe } from '../../src/hooks/useMe';
import { useFollow, useFollowGrade, useUnfollow } from '../../src/hooks/useFollow';
import { AuthError } from '../../src/components/authKit';
import { InfoCard } from '../../src/components/settingsKit';
import { ToyShadow } from '../../src/components/ToyShadow';
import { FollowButton } from '../../src/components/voteKit';
import { gradeLabel, gradeNumber, gradeShort } from '../../src/components/profileKit';
import { EmptyState, SkeletonRows } from '../../src/components/stateKit';
import { AuraIcon } from '../../src/components/AuraIcon';

/* 14A screen 4 — the People screen (route stays `add.tsx`).

   Following is one-directional and unapproved, so this needs no request state: tap Follow and the edge
   exists. What it buys is candidate weighting — someone you follow turns up in your polls several times
   as often as a stranger at the same school (the multiplier comes from the server, see
   PollRound.followWeightFactor). That's the whole reason the screen exists, so the copy says it rather
   than leaving "follow" to mean nothing in particular.

   Two calls from the design worth keeping in view while reading this file:

   - Suggestions lead, search is secondary. "A bare search box asks a student to already know who they
     want", and "Follows you" is its own group because following back is the highest-yield tap here.
   - No follower or following counts anywhere. In a 200-person school that number is a popularity score,
     which is the one thing this app is built not to publish.

   It is also deliberately not a fifth tab: the bar stays VOTE / FLAMES / RANKS / ME, and this screen is
   pushed from the Vote and Me headers' mint person-plus button, so it has a back affordance instead of a
   highlighted tab. */

function displayName(u: Schoolmate): string {
  return [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || 'Someone';
}

function initials(u: Schoolmate): string {
  return ((u.firstName?.[0] ?? '') + (u.lastName?.[0] ?? '')).toUpperCase() || '?';
}

/* Grades arrive in two spellings — "11" from onboarding, "Grade 11" from the admin screens — so every
   comparison here is on the normalised number and every label goes through profileKit. Without that, a
   chip read "Grade 10" at twice the width of its neighbours, your own grade failed to match itself so it
   wasn't excluded from the chip row, and the "follow all" row silently found nobody. */
function gradeLine(grade: string | null): string {
  return gradeLabel(grade) ?? 'Your school';
}

function gradeChip(grade: string): string {
  return gradeShort(grade) ?? grade;
}

const ACCENTS = ['#FF5CA8', '#6BF2C2', '#7C6CF5', '#FFD84D', '#F5A05C'];
function accentFor(id: string): string {
  let sum = 0;
  for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i);
  return ACCENTS[sum % ACCENTS.length];
}
const INK: Record<string, string> = { '#6BF2C2': '#0A3B2C', '#FFD84D': '#3A2A00' };

/** The three standing filters. Grade filters are appended from whatever grades actually exist. */
type Filter = 'suggested' | 'mine' | 'following' | { grade: string };

function sameFilter(a: Filter, b: Filter): boolean {
  if (typeof a === 'string' || typeof b === 'string') return a === b;
  return a.grade === b.grade;
}

export default function People() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: me } = useMe();
  const { data: schoolmates, isLoading, isError } = useSchoolmates();
  const { data: blockedPeople } = useBlockedPeople();
  const follow = useFollow();
  const unfollow = useUnfollow();
  const followGrade = useFollowGrade();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('suggested');

  const following = useMemo(() => new Set(me?.following ?? []), [me?.following]);
  const blockedIds = useMemo(() => new Set((blockedPeople ?? []).map(b => b.user.id)), [blockedPeople]);

  /* Blocked people are filtered out entirely here, unlike the report picker which greys them in — the
     one action on this screen is "follow", and following someone you blocked is refused server-side. */
  const people = (schoolmates ?? []).filter(s => !blockedIds.has(s.id));

  /* Grade chips come from the data, not from a hardcoded 9–12: a chip that filters to nobody is worse
     than no chip, and "grade" is a free-text field server-side. Own grade omitted, since "My grade"
     already covers it. */
  const myGrade = gradeNumber(me?.grade);
  const otherGrades = useMemo(() => {
    const found = new Set<string>();
    for (const p of people) {
      const g = gradeNumber(p.grade);
      if (g && g !== myGrade) found.add(g);
    }
    return [...found].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
  }, [people, myGrade]);

  const q = query.trim().toLowerCase();

  /* Which rows appear, in which group, in which order — frozen against a *snapshot* of the follow list
     rather than the live one.

     Following someone changes `me.following`, and every one of the three rules below reads it: list
     membership under the "Following" chip, the "Follows you" grouping, and the followed-last sort. Run
     live, one tap made the row you just touched jump out of its group and drop to the bottom of the
     list — the page rearranging itself under your thumb as a *reward* for acting, and taking the next
     row you meant to tap with it.

     The button still flips to "Following" the instant you tap, because that reads live state. Only the
     layout holds still. The snapshot refreshes when you change chip or search — moments where a reorder
     is expected rather than surprising — and once when `me` first loads, so the very first ordering
     isn't computed against an empty list. Done as a render-time compare rather than an Effect, per the
     house rule: an Effect would cost an extra render pass and could show one frame of the old order. */
  const orderKey = `${typeof filter === 'string' ? filter : `grade:${filter.grade}`}|${q}|${me ? 'me' : ''}`;
  const [order, setOrder] = useState<{ key: string; following: Set<string> }>(() => ({
    key: orderKey,
    following: new Set(me?.following ?? [])
  }));
  if (order.key !== orderKey) setOrder({ key: orderKey, following: new Set(me?.following ?? []) });
  const settled = order.key === orderKey ? order.following : new Set(me?.following ?? []);

  const matches = people.filter(s =>
    q.length === 0 ? true : `${displayName(s)} ${s.username ?? ''}`.toLowerCase().includes(q)
  );

  const filtered = matches.filter(s => {
    if (q.length > 0) return true; // A search spans the school; filters are for browsing.
    if (filter === 'mine') return !!myGrade && gradeNumber(s.grade) === myGrade;
    // Snapshot, so unfollowing by accident doesn't make the row vanish before you can undo it.
    if (filter === 'following') return settled.has(s.id);
    if (typeof filter !== 'string') return gradeNumber(s.grade) === filter.grade;
    return true;
  });

  /* Groups. "Follows you" first (and only among people you didn't already follow when the list was
     built — once you've followed back there's nothing left to do about it), then everyone else,
     followed people last so the list opens on the taps that are still available. */
  const followsYou = filtered.filter(s => s.followsMe && !settled.has(s.id));
  const rest = filtered.filter(s => !(s.followsMe && !settled.has(s.id)));
  const restSorted = [...rest].sort((a, b) => Number(settled.has(a.id)) - Number(settled.has(b.id)));

  /* Which grade the bulk row targets: the chip you picked, or your own while browsing suggestions.
     Hidden when there was nobody in it to follow, so it can't sit there as a no-op button.

     Two counts for the same reason the list is frozen: whether the row *exists* is decided by the
     snapshot, so tapping it doesn't yank the whole list upward, but the number it prints is live,
     because a row still claiming "4 people" after you followed them is simply false. When live hits
     zero the row stays put and turns into its own confirmation. */
  const bulkGrade = typeof filter !== 'string' ? filter.grade : filter === 'following' ? null : myGrade;
  const inGrade = bulkGrade ? people.filter(p => gradeNumber(p.grade) === bulkGrade) : [];
  const bulkShown = inGrade.some(p => !settled.has(p.id));
  const bulkCount = inGrade.filter(p => !following.has(p.id)).length;

  const error = follow.error ?? unfollow.error ?? followGrade.error;
  /* Which single row is mid-request, not "is anything happening".

     This used to be one screen-wide `busy` flag handed to every row, so following one person dimmed
     all twenty Follow buttons at once — the whole list looking pressed because you pressed one thing.
     `variables` is the userId the in-flight mutation was called with, so the dim lands on exactly the
     row that earned it and every other row stays live and tappable.

     Concurrent taps are safe now: `follow`/`unfollow` append and remove in SQL rather than writing back
     a list read at the start of the request, so two taps inside one round trip can't lose one another
     (see addFollowing in db.ts). */
  const pendingId = follow.isPending ? follow.variables : unfollow.isPending ? unfollow.variables : null;
  const bulkBusy = followGrade.isPending;

  const restLabel =
    q.length > 0
      ? 'RESULTS'
      : filter === 'following'
        ? 'PEOPLE YOU FOLLOW'
        : filter === 'mine' || (typeof filter !== 'string' && filter.grade === myGrade)
          ? 'IN YOUR GRADE'
          : typeof filter !== 'string'
            ? `IN ${gradeChip(filter.grade).toUpperCase()} GRADE`
            : 'AT YOUR SCHOOL';

  return (
    <View className="flex-1 bg-ground px-[21px]" style={{ paddingTop: insets.top + 14 }}>
      {/* Back affordance rather than a tab highlight — People is pushed, not switched to. */}
      <Pressable onPress={() => router.back()} hitSlop={10} className="flex-row items-center gap-3">
        <View className="h-[36px] w-[36px] items-center justify-center rounded-pill bg-surface">
          <Text className="font-nunito-900 text-[18px] leading-[20px] text-white">‹</Text>
        </View>
        <Text className="font-nunito-900 text-[14px] text-ink-muted">Back</Text>
      </Pressable>

      <Text className="font-fredoka-700 mt-4 text-[36px] leading-[38px] text-white">People</Text>
      <Text className="font-nunito-700 mt-[6px] text-[14px] text-ink-muted">
        Follow classmates to pull them into your polls
      </Text>

      <View className="mt-4 flex-row items-center gap-[9px] rounded-pill bg-surface px-[17px] py-[13px]">
        <AuraIcon name="search" size={17} color="#7A787C" />
        <TextInput
          className="font-nunito-700 flex-1 text-[15px] text-white"
          placeholder={me?.school?.name ? `Search ${me.school.name}` : 'Search your school'}
          placeholderTextColor="#7A787C"
          autoCapitalize="none"
          autoCorrect={false}
          selectionColor="#6BF2C2"
          value={query}
          onChangeText={setQuery}
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} hitSlop={10}>
            <AuraIcon name="close" size={16} color="#848286" />
          </Pressable>
        )}
      </View>

      {/* Wraps to two lines rather than scrolling: six chips don't fit the width, and an off-screen
          chip is an undiscovered filter. Hidden while searching, which spans the whole school anyway. */}
      {q.length === 0 && (
        <View className="mt-3 flex-row flex-wrap gap-2">
          <FilterChip label="Suggested" active={sameFilter(filter, 'suggested')} onPress={() => setFilter('suggested')} />
          {myGrade ? (
            <FilterChip label="My grade" active={sameFilter(filter, 'mine')} onPress={() => setFilter('mine')} />
          ) : null}
          <FilterChip label="Following" active={sameFilter(filter, 'following')} onPress={() => setFilter('following')} />
          {otherGrades.map(g => (
            <FilterChip
              key={g}
              label={gradeChip(g)}
              active={sameFilter(filter, { grade: g })}
              onPress={() => setFilter({ grade: g })}
            />
          ))}
        </View>
      )}

      {error && <AuthError message={(error as Error).message} />}

      <ScrollView className="mt-4" showsVerticalScrollIndicator={false}>
        {isError ? (
          <InfoCard icon="person">Couldn't load your school just now. Pull back and try again.</InfoCard>
        ) : isLoading ? (
          <SkeletonRows n={5} height={66} radius={22} avatarSize={42} avatarRadius={100} />
        ) : (
          <>
            {/* One tap instead of eighty-six. The server skips people you already follow, so it's
                idempotent and safe to press twice. */}
            {q.length === 0 && bulkGrade && bulkShown && (
              <View className="mb-4 flex-row items-center gap-[14px] rounded-24 bg-surface px-[18px] py-4">
                <View className="flex-1">
                  <Text className="font-nunito-900 text-[15.5px] text-white">
                    {bulkCount > 0 ? `Follow all of ${gradeLine(bulkGrade)}` : `Following all of ${gradeLine(bulkGrade)}`}
                  </Text>
                  <Text className="font-nunito-700 mt-[2px] text-[12.5px] text-ink-muted">
                    {bulkCount > 0
                      ? `${bulkCount} ${bulkCount === 1 ? 'person' : 'people'} · you can unfollow anyone later`
                      : 'You can unfollow anyone later'}
                  </Text>
                </View>
                {bulkCount > 0 ? (
                  <ToyShadow
                    depth={3}
                    shadowColor="#3FBF95"
                    backgroundColor="#6BF2C2"
                    radius={9999}
                    onPress={() => followGrade.mutate(bulkGrade)}
                    disabled={bulkBusy}
                    style={bulkBusy ? { opacity: 0.6 } : undefined}
                  >
                    <View className="px-4 py-[9px]">
                      <Text className="font-nunito-900 text-[13.5px]" style={{ color: '#0A3B2C' }}>
                        All
                      </Text>
                    </View>
                  </ToyShadow>
                ) : (
                  /* Holds the row's place instead of collapsing it and dragging the list up under the
                     thumb that just tapped it. Flat, because there's nothing left to press. */
                  <View className="flex-row items-center gap-[6px] rounded-pill px-4 py-[9px]" style={{ backgroundColor: '#4A474B' }}>
                    <AuraIcon name="check" size={14} color="#6BF2C2" />
                    <Text className="font-nunito-900 text-[13.5px]" style={{ color: '#6BF2C2' }}>
                      All
                    </Text>
                  </View>
                )}
              </View>
            )}

            {followsYou.length + restSorted.length === 0 ? (
              <EmptyState
                icon="search"
                title={q ? `Nobody matches "${query.trim()}"` : emptyTitle(filter)}
                body={
                  q
                    ? 'Search only covers your own school. Check the spelling, or try their handle.'
                    : emptyBody(filter)
                }
                ctaLabel={filter === 'suggested' ? undefined : 'Show everyone'}
                onCta={filter === 'suggested' ? undefined : () => setFilter('suggested')}
                ctaTone="mint"
              />
            ) : (
              <>
                {followsYou.length > 0 && (
                  <>
                    <Text className="font-nunito-900 text-[12.5px] text-ink-muted">FOLLOWS YOU</Text>
                    <View className="mt-[10px] gap-[9px]">
                      {followsYou.map(person => (
                        <PersonRow
                          key={person.id}
                          person={person}
                          isFollowing={false}
                          busy={pendingId === person.id}
                          onToggle={() => follow.mutate(person.id)}
                          onOpen={() => router.push({ pathname: '/u', params: { userId: person.id } })}
                        />
                      ))}
                    </View>
                  </>
                )}

                {restSorted.length > 0 && (
                  <>
                    <Text
                      className="font-nunito-900 text-[12.5px] text-ink-muted"
                      style={{ marginTop: followsYou.length > 0 ? 20 : 0 }}
                    >
                      {restLabel}
                    </Text>
                    <View className="mt-[10px] gap-[9px]">
                      {restSorted.map(person => (
                        <PersonRow
                          key={person.id}
                          person={person}
                          isFollowing={following.has(person.id)}
                          busy={pendingId === person.id}
                          onToggle={() =>
                            following.has(person.id) ? unfollow.mutate(person.id) : follow.mutate(person.id)
                          }
                          onOpen={() => router.push({ pathname: '/u', params: { userId: person.id } })}
                        />
                      ))}
                    </View>
                  </>
                )}
              </>
            )}
          </>
        )}

        <View className="mt-4 mb-2">
          <InfoCard icon="eyeOff">
            Nobody can see who you follow, and following someone never tells them anything.
          </InfoCard>
        </View>
      </ScrollView>
    </View>
  );
}

function emptyTitle(filter: Filter): string {
  if (filter === 'following') return "You're not following anyone yet";
  if (filter === 'mine') return 'Nobody from your grade yet';
  if (typeof filter !== 'string') return `Nobody in ${gradeChip(filter.grade)} grade yet`;
  return 'Nobody else is here yet';
}

function emptyBody(filter: Filter): string {
  if (filter === 'following')
    return 'Following someone pulls them into your polls more often. Nobody is told, and nobody has to approve it.';
  if (filter !== 'suggested') return 'Nobody from your school has joined with that grade set.';
  return "You're the first from your school on Aura. Invite someone and you'll both get more polls.";
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      className="rounded-pill px-[14px] py-2"
      style={{ backgroundColor: active ? '#6BF2C2' : '#403E41' }}
    >
      <Text
        className={active ? 'font-nunito-900 text-[12.5px]' : 'font-nunito-800 text-[12.5px]'}
        style={{ color: active ? '#0A3B2C' : '#C1C0C0' }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/* Cream row, so the people are the bright thing on the screen rather than the chrome around them.
   Tapping the row opens the profile; the button is its own target, so browsing and following don't
   fight each other. */
function PersonRow({
  person,
  isFollowing,
  busy,
  onToggle,
  onOpen
}: {
  person: Schoolmate;
  isFollowing: boolean;
  busy: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const accent = accentFor(person.id);
  return (
    <ToyShadow depth={4} shadowColor="#D9C7AF" backgroundColor="#FFF6E8" radius={22}>
      <View className="flex-row items-center gap-3 px-[14px] py-3">
        <Pressable onPress={onOpen} className="flex-1 flex-row items-center gap-3">
          <View className="h-[42px] w-[42px] items-center justify-center rounded-pill" style={{ backgroundColor: accent }}>
            <Text className="font-fredoka-700 text-[16px]" style={{ color: INK[accent] ?? '#FFFFFF' }}>
              {initials(person)}
            </Text>
          </View>
          <View className="flex-1">
            <Text className="font-nunito-900 text-[15.5px]" style={{ color: '#2D2A2E' }} numberOfLines={1}>
              {displayName(person)}
            </Text>
            <Text className="font-nunito-700 text-[12.5px]" style={{ color: '#8B888D' }} numberOfLines={1}>
              {gradeLine(person.grade)}
            </Text>
          </View>
        </Pressable>
        <FollowButton isFollowing={isFollowing} followsMe={person.followsMe} busy={busy} onPress={onToggle} />
      </View>
    </ToyShadow>
  );
}
