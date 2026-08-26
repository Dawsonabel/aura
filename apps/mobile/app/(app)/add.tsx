import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSchoolmates, type Schoolmate } from '../../src/hooks/useSchoolmates';
import { useBlockedPeople } from '../../src/hooks/useBlockedPeople';
import { useMe } from '../../src/hooks/useMe';
import {
  useAcceptFriendRequest,
  useCancelFriendRequest,
  useDenyFriendRequest,
  useRemoveFriend,
  useSendFriendRequest
} from '../../src/hooks/useFriends';
import { AuthError } from '../../src/components/authKit';
import { InfoCard } from '../../src/components/settingsKit';
import { ToyShadow } from '../../src/components/ToyShadow';
import { DenyButton, FriendButton } from '../../src/components/voteKit';
import { avatarAccent, gradeLabel, gradeNumber, gradeShort } from '../../src/components/profileKit';
import { EmptyState, SkeletonRows } from '../../src/components/stateKit';
import { AuraIcon } from '../../src/components/AuraIcon';

/* 14A screen 4 — the People screen (route stays `add.tsx`).

   Friendship is mutual and approved, so this screen has a middle state following never had: you ask,
   and nothing happens until they answer. What a friendship buys is candidate weighting — a friend turns
   up in your polls several times as often as a stranger at the same school (the multiplier comes from
   the server, see PollRound.followWeightFactor). That's the whole reason the screen exists, so the copy
   says it rather than leaving "add" to mean nothing in particular.

   Three calls from the design worth keeping in view while reading this file:

   - Suggestions lead, search is secondary. "A bare search box asks a student to already know who they
     want", and requests waiting on *you* are the highest-yield taps here, so they get their own group
     at the top — the slot "Follows you" used to hold, for the same reason.
   - No friend counts anywhere, yours or theirs. In a 200-person school that number is a popularity
     score, which is the one thing this app is built not to publish. The server enforces it too — see
     the `friends` field resolver.
   - Denying is silent. Nothing on this screen tells anyone they were turned down.

   It is also deliberately not a fifth tab: the bar stays VOTE / AURAS / RANKS / ME, and this screen is
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

/* The palette and hash that used to live here are now profileKit's `avatarAccent` — this screen's
   copy was the one the others should have been matching, so it moved rather than being replaced. */

/** The three standing filters. Grade filters are appended from whatever grades actually exist. */
type Filter = 'suggested' | 'mine' | 'friends' | { grade: string };

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
  const send = useSendFriendRequest();
  const cancel = useCancelFriendRequest();
  const accept = useAcceptFriendRequest();
  const deny = useDenyFriendRequest();
  const removeFriend = useRemoveFriend();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('suggested');

  const friendIds = useMemo(() => new Set(me?.friends ?? []), [me?.friends]);
  const blockedIds = useMemo(() => new Set((blockedPeople ?? []).map(b => b.user.id)), [blockedPeople]);

  /* Blocked people are filtered out entirely here, unlike the report picker which greys them in — the
     one action on this screen is adding someone, and befriending someone you blocked is refused
     server-side anyway. */
  const people = (schoolmates ?? []).filter(s => !blockedIds.has(s.id));

  /* One tap per state. The server treats "add someone who already asked you" as an accept, so the
     `received` case could route through `send` too — it goes to `accept` explicitly because the button
     says Accept, and a mutation named after the thing the user pressed is easier to follow in a log. */
  function primaryAction(person: Schoolmate) {
    if (person.friendState === 'friends') return removeFriend.mutate(person.id);
    if (person.friendState === 'sent') return cancel.mutate(person.id);
    if (person.friendState === 'received') return accept.mutate(person.id);
    return send.mutate(person.id);
  }

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

  /* Which rows appear, in which group, in which order — frozen against a *snapshot* of the friend
     graph rather than the live one.

     Acting on someone changes their `friendState`, and every rule below reads it: membership under the
     Friends chip, the incoming-requests group, and the friends-last sort. Run live, one tap made the
     row you just touched jump out of its group and drop to the bottom of the list — the page
     rearranging itself under your thumb as a *reward* for acting, and taking the next row you meant to
     tap with it.

     The button still flips the instant you tap, because that reads live state. Only the layout holds
     still. The snapshot refreshes when you change chip or search — moments where a reorder is expected
     rather than surprising — and once when the list first loads, so the very first ordering isn't
     computed against nothing. Done as a render-time compare rather than an Effect, per the house rule:
     an Effect would cost an extra render pass and could show one frame of the old order. */
  const orderKey = `${typeof filter === 'string' ? filter : `grade:${filter.grade}`}|${q}|${schoolmates ? 'has' : ''}`;
  const snapshotOf = (list: Schoolmate[]) => new Map(list.map(s => [s.id, s.friendState]));
  const [order, setOrder] = useState<{ key: string; state: Map<string, Schoolmate['friendState']> }>(() => ({
    key: orderKey,
    state: snapshotOf(people)
  }));
  if (order.key !== orderKey) setOrder({ key: orderKey, state: snapshotOf(people) });
  const settled = order.key === orderKey ? order.state : snapshotOf(people);
  const was = (id: string) => settled.get(id) ?? 'none';

  const matches = people.filter(s =>
    q.length === 0 ? true : `${displayName(s)} ${s.username ?? ''}`.toLowerCase().includes(q)
  );

  const filtered = matches.filter(s => {
    if (q.length > 0) return true; // A search spans the school; filters are for browsing.
    if (filter === 'mine') return !!myGrade && gradeNumber(s.grade) === myGrade;
    // Snapshot, so unfriending by accident doesn't make the row vanish before you can undo it.
    if (filter === 'friends') return was(s.id) === 'friends';
    if (typeof filter !== 'string') return gradeNumber(s.grade) === filter.grade;
    return true;
  });

  /* Groups. People waiting on your answer first — that's the tap with the most value on the screen and
     the one with somebody else on the other end of it. Then everyone else, with existing friends last
     so the list opens on what's still actionable. */
  const asked = filtered.filter(s => was(s.id) === 'received');
  const rest = filtered.filter(s => was(s.id) !== 'received');
  const restSorted = [...rest].sort((a, b) => Number(was(a.id) === 'friends') - Number(was(b.id) === 'friends'));

  const error = send.error ?? cancel.error ?? accept.error ?? deny.error ?? removeFriend.error;
  /* Which single row is mid-request, not "is anything happening".

     This used to be one screen-wide `busy` flag handed to every row, so acting on one person dimmed
     all twenty buttons at once — the whole list looking pressed because you pressed one thing.
     `variables` is the userId the in-flight mutation was called with, so the dim lands on exactly the
     row that earned it and every other row stays live and tappable.

     Concurrent taps are safe: every friend mutation edits the lists in SQL rather than writing back a
     copy read at the start of the request, so two taps inside one round trip can't lose one another
     (see addToIdList in db.ts). */
  const inFlight = [send, cancel, accept, deny, removeFriend].find(m => m.isPending);
  const pendingId = (inFlight?.variables as string | undefined) ?? null;

  const restLabel =
    q.length > 0
      ? 'RESULTS'
      : filter === 'friends'
        ? 'YOUR FRIENDS'
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
        Add classmates to pull them into your polls
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
          <FilterChip label="Friends" active={sameFilter(filter, 'friends')} onPress={() => setFilter('friends')} />
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
            {/* "Follow all of 11th grade · 86 people" sat here — one tap that followed a whole year
                group. It's gone with following itself: a friendship needs the other person to agree,
                and 86 pending requests is spam from the sender and a chore for 86 recipients. */}

            {asked.length + restSorted.length === 0 ? (
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
                {asked.length > 0 && (
                  <>
                    <Text className="font-nunito-900 text-[12.5px] text-ink-muted">WANTS TO BE FRIENDS</Text>
                    <View className="mt-[10px] gap-[9px]">
                      {asked.map(person => (
                        <PersonRow
                          key={person.id}
                          person={person}
                          busy={pendingId === person.id}
                          onPrimary={() => primaryAction(person)}
                          onDeny={() => deny.mutate(person.id)}
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
                      style={{ marginTop: asked.length > 0 ? 20 : 0 }}
                    >
                      {restLabel}
                    </Text>
                    <View className="mt-[10px] gap-[9px]">
                      {restSorted.map(person => (
                        <PersonRow
                          key={person.id}
                          person={person}
                          busy={pendingId === person.id}
                          onPrimary={() => primaryAction(person)}
                          onDeny={() => deny.mutate(person.id)}
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

        {/* The one line on this screen that earns its place: it states a rule you cannot see from the
            controls, and it's the rule people would otherwise assume the opposite of. */}
        <View className="mt-4 mb-2">
          <InfoCard icon="eyeOff">Nobody can see your friends, or how many you have.</InfoCard>
        </View>
      </ScrollView>
    </View>
  );
}

function emptyTitle(filter: Filter): string {
  if (filter === 'friends') return 'No friends yet';
  if (filter === 'mine') return 'Nobody from your grade yet';
  if (typeof filter !== 'string') return `Nobody in ${gradeChip(filter.grade)} grade yet`;
  return 'Nobody else is here yet';
}

function emptyBody(filter: Filter): string {
  if (filter === 'friends')
    return 'Send someone a request. Once they accept, you both turn up in each other’s polls more often.';
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
  busy,
  onPrimary,
  onDeny,
  onOpen
}: {
  person: Schoolmate;
  busy: boolean;
  onPrimary: () => void;
  onDeny: () => void;
  onOpen: () => void;
}) {
  const accent = avatarAccent(person.id);
  return (
    <ToyShadow depth={4} shadowColor="#D9C7AF" backgroundColor="#FFF6E8" radius={22}>
      <View className="flex-row items-center gap-3 px-[14px] py-3">
        <Pressable onPress={onOpen} className="flex-1 flex-row items-center gap-3">
          <View className="h-[42px] w-[42px] items-center justify-center rounded-pill" style={{ backgroundColor: accent.bg }}>
            <Text className="font-fredoka-700 text-[16px]" style={{ color: accent.ink }}>
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
        {/* Deny sits outside the primary button rather than inside it: an incoming request is the one
            row with two different answers, and burying the negative one behind a long-press or a
            second screen makes "no" harder to say than "yes". */}
        {person.friendState === 'received' && <DenyButton busy={busy} onPress={onDeny} />}
        <FriendButton state={person.friendState} busy={busy} onPress={onPrimary} />
      </View>
    </ToyShadow>
  );
}
