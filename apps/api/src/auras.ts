/* What a card gives away, and when.

   There are exactly two states now. Face down: the poll it came from, and the sender's gender. Flipped:
   their name and grade as well. Nothing in between — the clue ladder that used to sell the grade and
   the first initial as separate scratch-off tiles is gone, along with the coins that bought them.
   The flip is the only thing that turns a card over. */
import type { Db, User } from './db';
import { notBlocked } from './pollRound';
import { utcDay } from './streak';
import type { Tuning } from './tuning';

export type Aura = {
  id: string; emoji: string; q: string; color: string;
  /** Free on every card. */
  gender: string;
  /** Empty until flipped — it arrives with the name. */
  grade: string;
  infiniteAura: boolean; unread: boolean; anonymous: boolean;
  /** Null until flipped. */
  name: string | null;
  repeatAdmirer: boolean; pickCount: number;
  /** The most recent card from its sender — so the feed says "6 times" once, not six times. */
  newestFromSender: boolean;
  ts: string;
  /** Whether this card has been opened at full size. Not the same as flipped — see migrations.ts. */
  opened: boolean;
  /** True when the voter's gender was withheld because their cohort is too small to hide in. */
  detailHidden: boolean;
};

/* The anonymity floor. **Off by default** — tuning.cohortFloor is 0. Read this before raising it.

   What it was for: a aura used to name the voter's gender *and* grade for free — "a girl in 11th
   grade picked you". In a school with four girls in 11th that's a one-in-four guess handed over for
   nothing, and a coin for the first initial usually made it unique. So below a threshold of people
   sharing a (gender, grade) cohort, the attributes were withheld and the card read "someone at your
   school" instead.

   Why it's off: 16A moved the grade behind a coin, which took the pair apart. What remains free is
   gender alone, and gender alone is a far weaker identifier — in any real school it narrows the sender
   to roughly half of it. Meanwhile the cost of the floor is paid on every card in a *small* school: a
   grid of cards that all read "Someone" tells you nothing, looks broken, and hides an attribute the
   product treats as free everywhere else ("gender is free, the name never is"). The floor was
   protecting a pairing that no longer leaks.

   What raising it back costs and buys: set AURA_COHORT_FLOOR to N and any sender whose gender+grade
   cohort has fewer than N people goes back to "Someone" — safer in a school small enough that a gender
   narrows to a handful, at the price of a grid that mostly won't say who picked you. It stays wired up
   for exactly that case. Note it keys on the *pair*, so it still reads grade even though grade is now
   the paid tile.

   The coin-revealed initial is deliberately NOT suppressed either way: it's opt-in, it costs
   something, and it is the game. This floor is only ever about what leaks for free. */
/** The window "N people picked you this week" counts over. */
const WEEK_DAYS = 7;


/* Distinct people who picked this user in the last week — the Inbox subtitle's number.

   A count, never identities: it's derived from the same filtered vote set the auras come from, so
   blocked and expired votes are already excluded, and nothing about *who* leaves this function. */
export function admirersThisWeek(auras: { voterId: string; ts: string }[]): number {
  const cutoff = Date.now() - WEEK_DAYS * 86400_000;
  const recent = auras.filter(f => new Date(f.ts).getTime() >= cutoff);
  return new Set(recent.map(f => f.voterId)).size;
}

export type FlipState = { day: string; used: number; left: number };

/* How many flips are left today, and which day "today" is.

   Stored as a count plus the day it belongs to, and reset lazily by comparing days on read — the same
   shape as the streak, and for the same reason: nothing runs at midnight, so a stored counter has to
   carry the day it was counted on or it never resets.

   UTC, matching the streak and the Ranks week. A device-local boundary would let anyone mint extra
   flips by changing timezone, and the reset has to land at one moment for everybody or the copy
   ("they reset at midnight") is only true where you happen to be standing.

   Non-members get zero, not `dailyFlips`: the allowance is what membership buys, so there is nothing
   to count down for someone who hasn't bought it. */
export function flipState(user: User, tuning: Tuning, now = new Date()): FlipState {
  const day = utcDay(now);
  const on = typeof user.flipsOn === 'string' ? user.flipsOn : null;
  const used = on === day && typeof user.flipsUsed === 'number' ? user.flipsUsed : 0;
  return { day, used, left: user.infiniteAura ? Math.max(0, tuning.dailyFlips - used) : 0 };
}

export type AurasFor = { auras: Aura[]; admirerCount: number };

/* Returns the auras *and* the distinct-admirer count together, rather than exposing a second
   function: the count needs voter ids, and those must not leave this module. One query either way. */
export async function aurasFor(db: Db, user: User, tuning: Tuning): Promise<AurasFor> {
  /* 12A's Inbox footer states "auras disappear after 30 days". The window is applied in the query
     rather than as a delete job — no destructive background work, the rows stay for admin/analytics,
     and the read stops scaling with lifetime vote history. */
  const cutoffIso = new Date(Date.now() - tuning.auraLifetimeDays * 86400_000).toISOString();
  const allVotes = await db.getRawVotesForTarget(user.id, cutoffIso);
  const voterIds = [...new Set(allVotes.map(v => v.voterId))];
  const voters = await db.getUsersByIds(voterIds);
  const voterOf = new Map(voters.map(v => [v.id, v]));

  /* Blocking hides that person's auras. It's a read-time filter, not a delete: the vote rows stay,
     so unblocking brings the auras back — which is why the blocked list's copy says exactly that
     rather than promising they're gone for good.

     Mutual, via the same notBlocked() the round eligibility uses: "you both disappear from each
     other's grid" cuts both ways, so a aura from someone who blocked *you* is hidden too. A vote
     whose voter no longer exists is kept — a deleted account isn't a blocked one, and those already
     render as an unknown admirer. */
  const votes = allVotes.filter(v => {
    const voter = voterOf.get(v.voterId);
    return !(voter && !notBlocked(user, voter));
  });

  /* Cohort sizes for the anonymity floor, one aggregate for the whole school. Skipped entirely when
     there are no auras to label — and when the floor is off (the default), since a floor of 0 can
     never mark a cohort too small and the whole-school aggregate would be paid for nothing on every
     Inbox open. */
  const cohortSize = new Map<string, number>();
  if (tuning.cohortFloor > 0 && votes.length > 0 && user.schoolId) {
    for (const row of await db.getCohortCounts(user.schoolId as string)) {
      cohortSize.set(`${row.gender ?? ''}|${row.grade ?? ''}`, row.n);
    }
  }
  const tooSmallToHideIn = (voter: User | null): boolean => {
    if (!voter) return false; // a deleted voter already shows no attributes
    const n = cohortSize.get(`${String(voter.gender ?? '')}|${String(voter.grade ?? '')}`) ?? 0;
    return n < tuning.cohortFloor;
  };

  // pickCount needs, per voter, how many total votes they've cast at this target — compute once.
  const countsByVoter = new Map<string, number>();
  for (const v of votes) countsByVoter.set(v.voterId, (countsByVoter.get(v.voterId) || 0) + 1);

  /* Which card is the most recent one from its sender — the Activity feed's repeat-admirer line.

     The feed wants to say "that's 6 times from the same person" exactly once, on the card that made it
     6. It cannot work that out for itself: `pickCount` is on all six of that sender's cards and
     `voterId` is deliberately not on any of them, so a client has no way to tell the six apart and
     would print the same line six times.

     Computing it here rather than shipping voterId is the point. This is a boolean about the reader's
     own grid — "is this the newest of a set you already hold" — and it says nothing about the sender
     that `pickCount` didn't already say. Handing over voterId to let the client group them would leak
     which anonymous cards came from one person, which is the entire thing a card is hiding.

     `votes` arrives newest-first (getRawVotesForTarget orders by ts DESC), so the first id seen for a
     voter is their most recent. */
  const newestFromSender = new Set<string>();
  const seenVoter = new Set<string>();
  for (const v of votes) {
    if (seenVoter.has(v.voterId)) continue;
    seenVoter.add(v.voterId);
    newestFromSender.add(v.id);
  }

  const auras = votes.map(v => {
    const voter = voterOf.get(v.voterId) || null;
    const gm = !!user.infiniteAura;
    const anonymous = !!(voter && voter.infiniteAura);
    const pickCount = countsByVoter.get(v.voterId) || 0;
    /* Per card. A classmate who picked you five times is five cards, and a flip opens the one it was
       spent on — the other four stay face down. It used to be per *person* (`user.revealedVoters`),
       which turned one flip into five reveals and made the day's allowance mean whatever the sender's
       pick count happened to be.

       `!anonymous` below: a sender with Infinite Aura is hidden from everyone, and that holds
       retroactively. Someone can flip a card and *then* the sender becomes a member — this is
       recomputed per request, so the name goes back in the envelope rather than staying out because of
       a flag set before the sender was entitled to hide. */
    const nameShown = v.nameRevealed && !!voter && !anonymous;
    /* The anonymity floor, off by default — see the note at the top of this file. It covers gender and
       grade together, which are exactly the two attributes a face-down card gives away, and which the
       floor was written to consider as a pair ("a girl in 11th grade"). Withheld rather than merely
       unrendered: both values are blanked in the payload too, so a client that ignores `detailHidden`
       still can't leak them. Doesn't apply once the card is flipped — by then the sender has been
       identified outright, and hiding their gender from someone holding their name is theatre. */
    const detailHidden = !nameShown && tooSmallToHideIn(voter);
    return {
      id: v.id, emoji: v.emoji, q: v.text, color: v.color,
      gender: detailHidden ? 'private' : voter ? String(voter.gender) : 'nonbinary',
      /* Free on every card, like the gender beside it.

         It has been all three things: free, then a scratch tile with a price, then bundled with the
         name. It is free again — a face-down card says "a girl in 11th grade", which is the line the
         product has always used to describe what a pick tells you, and holding the grade back made the
         grid read as though two thirds of the cards were broken. What the flip buys is the *name*,
         and only that. The floor above is what covers the pair when a school is small enough to need
         it. */
      grade: detailHidden ? '' : voter ? String(voter.grade ?? '') : '',
      infiniteAura: gm, unread: v.unread, anonymous,
      name: nameShown ? `${voter!.firstName} ${voter!.lastName}` : null,
      repeatAdmirer: pickCount >= 2 && !anonymous, pickCount,
      /* True on one card per sender — see newestFromSender above. Always false on an anonymous card,
         matching repeatAdmirer: a protected sender's cards don't advertise that they're a set. */
      newestFromSender: newestFromSender.has(v.id) && !anonymous,
      ts: v.ts,
      /* Straight through — no privacy logic to apply. This is a fact about the *reader's* own
         behaviour ("have I looked at this card"), not about the sender, so unlike gender and grade
         there is nothing here to withhold. */
      opened: v.opened,
      detailHidden
    };
  });

  return { auras, admirerCount: admirersThisWeek(votes) };
}

/* What your friends' cards may say to *you* — the Activity feed's second kind of row.
   "A boy gave Emma aura", and nothing else.

   ## Why this is a different function and not a parameter on aurasFor

   A aura is a card you own: you may flip it, and flipping is what buys the name. A friend row is not
   a card and can never become one. There is no flip, no grade, no pickCount, no repeat-admirer badge —
   and deliberately **no superlative**. That last one is the whole reason this returns its own narrow
   type instead of reusing Aura with fields blanked: a type that *could* carry `q` is a type someone
   later fills in, and "a boy gave Emma aura for 'most likely to get arrested'" is a sentence about
   Emma that Emma never agreed to have forwarded. What she was picked for is hers to share. That it is
   absent from the payload rather than merely unrendered is the point.

   ## What a voter consented to

   Casting a vote means appearing, anonymously, in the target's own grid. It does not mean appearing in
   that target's friends' feeds — so everything below is about narrowing what a third party learns:

     · a protected voter (Infinite Aura) reads as "Someone", never by gender. They are hidden from the
       person they picked; leaking their gender one seat over would make this feed a better
       deanonymiser than the inbox it borrows from.
     · the cohort floor applies exactly as it does on a card, using this school's counts — friendships
       are same-school (see sendFriendRequest), so the voter is in the caller's own aggregate.
     · blocking cuts both ways here too, on both ends: a friend you've blocked contributes no rows, and
       neither does a voter you've blocked. Reading a blocked person's picks second-hand is precisely
       what blocking is for.
     · your own votes for a friend are dropped. You were there; it isn't news, and a row saying "a boy
       gave Emma aura" that is secretly *you* is the one row in the feed that could out a voter, since
       you know which one you cast.

   What's left is a gender and a first name — the same two facts the friend's own grid shows them,
   minus the card. */
export type FriendActivityEvent = {
  id: string; ts: string; friendId: string; friendName: string;
  /** The voter's, or "private" — withheld the same way a card withholds it. */
  gender: string;
  /* The prompt the vote was cast on, and its emoji — the same pair the target sees on their own card.
     Carried on the vote row itself, so this costs no extra query.

     This used to be withheld, and the argument for withholding it is still worth knowing: a friend
     event is one anonymous vote, so naming the prompt creates a per-vote fact about your friend that
     they never published anywhere. It's a real cost and it is being paid deliberately — a feed of "a
     boy gave Emma aura" with no subject is a feed of identical rows, and the prompt is the only thing
     that makes one friend's day distinguishable from another's.

     What is *not* being given up: the voter stays anonymous. Gender is still the only thing said about
     them, still withheld for protected voters and small cohorts. The prompt says what was claimed, not
     who claimed it, and the withheld-gender logic below is untouched. */
  label: string; emoji: string;
};

/* Enough to fill a feed nobody scrolls to the bottom of, capped because it is a merged timeline over
   an unbounded number of friends and the client renders it in a ScrollView. */
const FRIEND_ACTIVITY_MAX = 60;

export async function friendActivityFor(db: Db, user: User, tuning: Tuning): Promise<FriendActivityEvent[]> {
  const friendIds = (user.friends as string[]) || [];
  if (!friendIds.length) return [];

  /* Blocking severs a friendship at the point it happens, so this filter is belt-and-braces — but the
     edge is stored on two rows and this read costs nothing next to the vote query. */
  const friends = (await db.getUsersByIds(friendIds)).filter(f => notBlocked(user, f));
  if (!friends.length) return [];
  const friendOf = new Map(friends.map(f => [f.id, f]));

  const cutoffIso = new Date(Date.now() - tuning.auraLifetimeDays * 86400_000).toISOString();
  const votes = await db.getRawVotesForTargets(friends.map(f => f.id), cutoffIso, FRIEND_ACTIVITY_MAX);
  if (!votes.length) return [];

  const voters = await db.getUsersByIds([...new Set(votes.map(v => v.voterId))]);
  const voterOf = new Map(voters.map(v => [v.id, v]));

  // Same aggregate as aurasFor, and skipped for the same reason when the floor is off (the default).
  const cohortSize = new Map<string, number>();
  if (tuning.cohortFloor > 0 && user.schoolId) {
    for (const row of await db.getCohortCounts(user.schoolId as string)) {
      cohortSize.set(`${row.gender ?? ''}|${row.grade ?? ''}`, row.n);
    }
  }

  const events: FriendActivityEvent[] = [];
  for (const v of votes) {
    const friend = friendOf.get(v.targetId);
    if (!friend) continue;
    if (v.voterId === user.id) continue;

    const voter = voterOf.get(v.voterId) || null;
    if (voter && !notBlocked(user, voter)) continue;

    /* A deleted voter has no gender to give, a protected one has one it may keep, and a voter below the
       floor is in a cohort too small to hide in. All three land on the same word. */
    const withheld =
      !voter ||
      !!voter.infiniteAura ||
      (tuning.cohortFloor > 0 &&
        (cohortSize.get(`${String(voter.gender ?? '')}|${String(voter.grade ?? '')}`) ?? 0) < tuning.cohortFloor);

    events.push({
      id: v.id,
      ts: v.ts,
      friendId: friend.id,
      /* First name only. The feed is a room of people you know by first name, and a full name here
         would read as a directory entry rather than as something that just happened. */
      friendName: String(friend.firstName || '').trim() || 'A friend',
      gender: withheld ? 'private' : String(voter.gender ?? 'private'),
      label: String(v.text ?? ''),
      emoji: String(v.emoji ?? '')
    });
  }
  return events;
}

/* Things your friends have done, rather than things done to them — the feed's second friend row.

   ## Why this one may carry a superlative when friendActivityFor may not

   That looks like a contradiction and isn't. A friend *event* is one anonymous vote, and naming the
   prompt on it ("a boy gave Emma aura for X") ties a specific hidden voter to a specific claim about
   Emma — an object that exists nowhere else and that Emma never published.

   A *milestone* is the aggregate: "Emma's won Best smile ×5". That already sits on her public profile
   — `publicProfile` returns `superlatives` to anyone at her school (see profile.ts) — so this surfaces
   something she is already showing, rather than deriving something new from cards she can't see. The
   line between the two is per-vote versus per-person, and it is the same line `pickCount` sits on.

   ## Floors

   `MIN_WINS` and `MIN_STREAK` exist to keep this a milestone rather than a status readout. Every
   friend has *some* top superlative and *some* streak; emitting them all would put a permanent block
   of friend rows at the top of every feed, which is a leaderboard, not news. Only one of each kind per
   friend, and only once it's worth remarking on. */
export type FriendMilestone = {
  id: string; ts: string; friendId: string; friendName: string;
  /** "streak" | "superlative" */
  kind: string;
  /** Days for a streak, wins for a superlative. */
  count: number;
  /** The superlative's prompt and emoji. Empty on a streak. */
  label: string; emoji: string;
};

const MIN_WINS = 3;
const MIN_STREAK = 3;

export async function friendMilestonesFor(db: Db, user: User, tuning: Tuning): Promise<FriendMilestone[]> {
  const friendIds = (user.friends as string[]) || [];
  if (!friendIds.length) return [];

  const friends = (await db.getUsersByIds(friendIds)).filter(f => notBlocked(user, f));
  if (!friends.length) return [];

  const nameOf = (f: User) => String(f.firstName || '').trim() || 'A friend';
  const out: FriendMilestone[] = [];

  /* Dated to the day they last played, not to now. A streak is a claim about a run of days, and
     stamping it "just now" would float it to the top of the feed every time the query ran, whether or
     not anything about it had changed. `lastPlayedOn` is a calendar day (see streak.ts), so it's
     pinned to midday UTC — far enough from either boundary that the reader's timezone can't shift it
     onto the wrong day heading. */
  for (const f of friends) {
    const streak = typeof f.streak === 'number' ? f.streak : 0;
    const day = typeof f.lastPlayedOn === 'string' ? f.lastPlayedOn : null;
    if (streak < MIN_STREAK || !day) continue;
    out.push({
      id: `streak-${f.id}-${day}`,
      ts: `${day}T12:00:00.000Z`,
      friendId: String(f.id),
      friendName: nameOf(f),
      kind: 'streak',
      count: streak,
      label: '',
      emoji: ''
    });
  }

  const cutoffIso = new Date(Date.now() - tuning.auraLifetimeDays * 86400_000).toISOString();
  const tallies = await db.getSuperlativeCountsForTargets(friends.map(f => String(f.id)), cutoffIso);

  // Best per friend, ties broken by recency so the feed shows the one that just moved.
  const best = new Map<string, (typeof tallies)[number]>();
  for (const t of tallies) {
    if (t.n < MIN_WINS) continue;
    const held = best.get(t.targetId);
    if (!held || t.n > held.n || (t.n === held.n && t.lastTs > held.lastTs)) best.set(t.targetId, t);
  }

  const friendOf = new Map(friends.map(f => [String(f.id), f]));
  for (const [targetId, t] of best) {
    const friend = friendOf.get(targetId);
    if (!friend) continue;
    out.push({
      id: `sup-${targetId}-${t.text}`,
      ts: t.lastTs,
      friendId: targetId,
      friendName: nameOf(friend),
      kind: 'superlative',
      count: t.n,
      label: t.text,
      emoji: t.emoji
    });
  }

  return out;
}
