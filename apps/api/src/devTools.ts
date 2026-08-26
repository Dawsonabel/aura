/* Test-state shortcuts, and the gate that keeps them out of production.

   ## Why these exist

   Most of what this app does is on a timer. Flips reset at midnight UTC, rounds refill on the clock
   hour, the streak needs consecutive days, and a Cards grid worth looking at needs other people to
   have voted for you. Checking any of it by hand means waiting out a real day, or hand-writing SQL
   against a live branch — which is how a `DATABASE_URL` ends up pasted somewhere it shouldn't be.
   Each mutation here collapses one of those waits into a button.

   ## The gate

   `AURA_DEV_TOOLS` must be exactly "1". It is deliberately NOT set in wrangler.toml, so a deploy
   never carries it: production is off because the variable does not exist there, not because a flag
   defaults to false. Locally it comes from .dev.vars, which is gitignored.

   That matters more here than anywhere else in the API, because these bypass the economy rather than
   ride it. `devGrantSparks` mints currency, `devResetFlips` refunds a paid reveal, `devSeedVotes`
   fabricates other people's votes. If any of these were reachable in production the game would have
   no scarcity at all — so the check is a hard throw at the top of every resolver, with no "unless
   admin" or "unless localhost" branch to get wrong. One condition, one place.

   Two independent gates, in fact: the mobile client only renders these behind `__DEV__`, which the
   bundler strips from release builds. Either one alone would do; both means a mistake in one is not
   enough on its own.

   ## Not a substitute for the real thing

   These write the same rows the product writes, so what you get is real state, not a mock — a seeded
   vote is a vote, and flipping it spends a flip. What they skip is how that state is normally
   *reached*. A bug in the actual vote path won't show up here. */
import type { Db, Poll, User } from './db';
import type { Tuning } from './tuning';

export type DevResult = { ok: boolean; message: string };

/** Throws unless AURA_DEV_TOOLS is exactly "1". Every resolver below calls this first, no exceptions. */
export function requireDevTools(env: { [k: string]: unknown }): void {
  if (String(env.AURA_DEV_TOOLS ?? '') !== '1') {
    throw new Error('Dev tools are not enabled on this environment');
  }
}

/* Deterministic-ish variety without a seeded RNG: these are test fixtures, and a fresh shuffle each
   time is a feature — running the seeder twice should not produce the same grid twice. */
function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/* Give back today's allowance and put every card back to untouched.

   Two halves because the allowance alone isn't the interesting half. Flips are spent *per card*, so
   once you've turned the only four cards you have, refilling the counter leaves nothing to spend it
   on — the screen you actually wanted to see again (a face-down card with a live Flip button) is
   unreachable. Restoring the cards is what makes the refill mean anything.

   "Untouched" includes `opened`, not just the flip. A protected sender's card goes lavender in the
   grid once you've opened it and found out — that's the whole point of it, and it's meant to be
   earned by tapping. A reset that left `opened` set handed that state back to you for free, so the
   next run started already knowing the answer and the discovery couldn't be tested at all.

   `flipsUsed: 0` rather than clearing `flipsOn`: flipState() reads the stored day and only counts
   `flipsUsed` when it matches today, so either works, but writing an explicit zero leaves the row
   readable — "0 used today" rather than "no record", which is the same thing but doesn't look like
   corruption when you're staring at the JSONB blob wondering why a number is missing. */
export async function devResetFlips(db: Db, me: User, tuning: Tuning): Promise<DevResult> {
  const restored = await db.devResetCardStateForTarget(me.id);
  await db.updateUser(me.id, { flipsUsed: 0 });
  const allowance = me.infiniteAura ? tuning.dailyFlips : 0;
  return {
    ok: true,
    /* Names the allowance actually restored, which is 0 without Infinite Aura — flipState() gives
       non-members nothing, so a flat "2 flips restored" would be a lie exactly when it matters. */
    message: `${allowance} flip${allowance === 1 ? '' : 's'} back · ${restored} card${restored === 1 ? '' : 's'} reset`
  };
}

/* Fabricate incoming votes, spread out and repeated the way real ones are.

   The point is variety, not volume. A grid where every card is from a different person on the same
   day exercises almost nothing: no repeat-admirer badge, no "voted for you 4 times", no mix of
   flipped and face-down, no ordering by age, and every timestamp reads "just now". So this varies
   four things on purpose:

     · WHO — voters are drawn with repeats, so some people pick you several times and the pickCount
       line and repeat-admirer badge have something to show
     · WHEN — spread across the aura window, which is what makes voteStamp's "3 h ago" vs "Tuesday"
       vs "5 Aug" branches reachable in one grid
     · WHAT — a random enabled poll each time, so the prompts and their emoji/colour differ
     · STATE — a few arrive already flipped and already read, because a grid that is uniformly
       face-down and uniformly unread is not what a real one looks like after a few days

   Anonymous senders aren't produced here — see devAnonymousVote below, which is its own button
   because making one has a side effect on another account and shouldn't happen twelve times by
   accident in the middle of a bulk seed. */
export async function devSeedVotes(db: Db, me: User, tuning: Tuning, count: number): Promise<DevResult> {
  const n = Math.max(1, Math.min(40, Math.floor(count) || 8));

  const classmates = await db.getUsersBySchool(me.schoolId, me.id);
  if (!classmates.length) {
    return { ok: false, message: 'No classmates at your school to vote for you' };
  }
  /* School-specific polls plus the global ones, matching what a round would actually serve — seeding
     a prompt this school can't be asked would put a card in the grid the voting loop can't produce. */
  const polls = (await db.getPolls()).filter(
    (p: Poll) => p.enabled && (p.schoolId === null || p.schoolId === me.schoolId)
  );
  if (!polls.length) {
    return { ok: false, message: 'No enabled polls to vote with' };
  }

  /* A small pool drawn from the class, so repeats actually happen. Picking freely from every
     classmate makes pickCount 1 for nearly everyone at any realistic school size. */
  const poolSize = Math.max(2, Math.min(classmates.length, Math.ceil(n / 2.5)));
  const pool = [...classmates].sort(() => Math.random() - 0.5).slice(0, poolSize);

  const windowMs = Math.max(1, tuning.auraLifetimeDays) * 86_400_000;
  const now = Date.now();

  for (let i = 0; i < n; i++) {
    const voter = pick(pool);
    const poll = pick(polls);
    /* Weighted toward recent: squaring a 0..1 random keeps most cards in the last few days and lets a
       few drift back toward the edge of the window, which is roughly how a real inbox fills. Capped
       just inside the window so a seeded card can't be born already expired and invisible. */
    const age = Math.random() ** 2 * windowMs * 0.95;
    await db.devInsertVote({
      id: 'vote_' + crypto.randomUUID().slice(0, 12),
      voterId: String(voter.id),
      targetId: me.id,
      questionId: poll.id,
      emoji: poll.emoji,
      text: poll.text,
      color: poll.color,
      ts: new Date(now - age).toISOString(),
      // Roughly a quarter already opened, so the grid isn't uniformly face down.
      nameRevealed: Math.random() < 0.25,
      unread: Math.random() < 0.6
    });
  }

  return { ok: true, message: `${n} votes from ${pool.length} classmates` };
}

/* One card that can never be flipped, from a sender who is protected the way you are.

   The awkward part, stated plainly: a card is anonymous because its *voter* has Infinite Aura —
   `anonymous` is recomputed per request from the voter's membership (see auras.ts), not stored on
   the vote. There is no such thing as an anonymous vote row. So the only way to produce one is to
   give some other account membership, and this button does exactly that.

   Two things keep that contained. It prefers a classmate who is *already* a member, so repeated
   presses reuse the same person instead of quietly upgrading the whole school. And it names whoever
   it used in the result, because a silent write to somebody else's account is the kind of thing you
   need to be told about — you may want to undo it, and you can't undo what you weren't told.

   Naming them is also better for the test rather than worse: knowing it's Emma's card is precisely
   what lets you confirm the screen never says Emma.

   Dated now and left unread, so it lands at the front of the grid where you'll actually find it. */
export async function devAnonymousVote(db: Db, me: User): Promise<DevResult> {
  const classmates = await db.getUsersBySchool(me.schoolId, me.id);
  if (!classmates.length) {
    return { ok: false, message: 'No classmates at your school to vote for you' };
  }
  const polls = (await db.getPolls()).filter(
    (p: Poll) => p.enabled && (p.schoolId === null || p.schoolId === me.schoolId)
  );
  if (!polls.length) {
    return { ok: false, message: 'No enabled polls to vote with' };
  }

  const alreadyMember = classmates.find(u => !!u.infiniteAura);
  const voter = alreadyMember ?? pick(classmates);
  if (!alreadyMember) {
    await db.updateUser(String(voter.id), { infiniteAura: true, infiniteAuraExpires: null });
  }

  const poll = pick(polls);
  await db.devInsertVote({
    id: 'vote_' + crypto.randomUUID().slice(0, 12),
    voterId: String(voter.id),
    targetId: me.id,
    questionId: poll.id,
    emoji: poll.emoji,
    text: poll.text,
    color: poll.color,
    ts: new Date().toISOString(),
    nameRevealed: false,
    unread: true
  });

  const who = [voter.firstName, voter.lastName].filter(Boolean).join(' ') || 'a classmate';
  return {
    ok: true,
    message: alreadyMember
      ? `Anonymous card from ${who} (already a member)`
      : `Anonymous card from ${who} — gave them Infinite Aura`
  };
}

/* Friends, and picks for them to receive — the Activity feed's friend rows.
   "A boy gave Emma aura" needs an Emma who is your friend and who somebody else has picked, and
   there is no way to reach that by tapping around your own account: friend requests need the other
   person to accept, and their picks need a third party to cast. Both halves are done here.

   Like devAnonymousVote, this writes to other people's rows — it befriends them on their behalf,
   without a request they ever saw. So it names them, for the same reason: you may want to undo it,
   and you can't undo what you weren't told. Three at most, so a press doesn't quietly wire you into
   half the school.

   Voters are drawn from the whole class excluding the friend themselves. Your own id can't come up —
   getUsersBySchool already excludes you — which matters because friendActivityFor drops votes you
   cast, so seeding one would produce a row that silently never renders. */
export async function devSeedFriendActivity(db: Db, me: User, tuning: Tuning, count: number): Promise<DevResult> {
  const n = Math.max(1, Math.min(30, Math.floor(count) || 9));

  const classmates = await db.getUsersBySchool(me.schoolId, me.id);
  if (classmates.length < 2) {
    return { ok: false, message: 'Need at least 2 classmates at your school' };
  }
  const polls = (await db.getPolls()).filter(
    (p: Poll) => p.enabled && (p.schoolId === null || p.schoolId === me.schoolId)
  );
  if (!polls.length) {
    return { ok: false, message: 'No enabled polls to vote with' };
  }

  const shuffled = [...classmates].sort(() => Math.random() - 0.5);
  const friends = shuffled.slice(0, Math.min(3, classmates.length - 1));

  /* Both rows, because a friendship is symmetric — writing only your side would give you a feed while
     leaving them with a friend who can't see them back, which is not a state the product can produce
     and so not one worth testing against. */
  for (const f of friends) {
    await db.addToIdList(me.id, 'friends', [String(f.id)]);
    await db.addToIdList(String(f.id), 'friends', [me.id]);
  }

  const windowMs = Math.max(1, tuning.auraLifetimeDays) * 86_400_000;
  const now = Date.now();

  for (let i = 0; i < n; i++) {
    const friend = pick(friends);
    const voter = pick(classmates.filter(u => u.id !== friend.id));
    const poll = pick(polls);
    // Same recency weighting as devSeedVotes, so friend rows interleave with your own instead of
    // stacking in one block at the top of the feed.
    const age = Math.random() ** 2 * windowMs * 0.95;
    await db.devInsertVote({
      id: 'vote_' + crypto.randomUUID().slice(0, 12),
      voterId: String(voter.id),
      targetId: String(friend.id),
      questionId: poll.id,
      emoji: poll.emoji,
      text: poll.text,
      color: poll.color,
      ts: new Date(now - age).toISOString(),
      nameRevealed: false,
      unread: true
    });
  }

  const names = friends.map(f => String(f.firstName || 'someone')).join(', ');
  return { ok: true, message: `${n} picks for ${names} — now your friends` };
}

/** Wipes every card you've received — the empty Cards grid is otherwise unreachable once seeded. */
export async function devClearCards(db: Db, me: User): Promise<DevResult> {
  const gone = await db.devDeleteVotesForTarget(me.id);
  return { ok: true, message: `${gone} card${gone === 1 ? '' : 's'} deleted` };
}

/** Tops up the balance, for testing rerolls and the Shop without grinding rounds. */
export async function devGrantSparks(db: Db, me: User, amount: number): Promise<DevResult> {
  const delta = Math.max(-10_000, Math.min(10_000, Math.floor(amount) || 50));
  const total = await db.adjustCoins(me.id, delta);
  return { ok: true, message: `${delta >= 0 ? '+' : ''}${delta} sparks · ${total ?? 0} total` };
}

/* Refill the hourly round allowance.

   `currentRoundId: null` matters as much as the count. The user row remembers the round in flight,
   and leaving a stale id there means the next start resumes the old round — you'd get the same
   questions back with your previous answers already registered, which looks like the refill silently
   failing. Clearing both is what makes the next tap a genuinely new round. */
export async function devResetRounds(db: Db, me: User, tuning: Tuning): Promise<DevResult> {
  await db.updateUser(me.id, { roundsInHour: 0, currentRoundId: null });
  return { ok: true, message: `${tuning.roundsPerHour} round${tuning.roundsPerHour === 1 ? '' : 's'} available` };
}

/* Set the streak to any day, without needing that many days.

   Day 2 is the interesting one and the hardest to reach honestly: the streak bonus is paid from the
   second consecutive day, so day 1 pays nothing and the difference between "correct" and "broken" is
   invisible unless you can stand on both sides of it.

   `lastPlayedOn` is set to yesterday rather than today deliberately, and that is the whole trick.
   advanceStreak() returns null when the stored day is already today, so a streak dated today is
   *finished* — the next completed round changes nothing and pays no streak bonus. Dated yesterday,
   the run is alive and today's first round is what extends it, which is the case worth testing.

   It also has to be exactly yesterday: advanceStreak only continues a run when the stored day is the
   calendar day before today, and restarts at 1 otherwise. A two-day-old date would silently reset the
   number you just set. */
export async function devSetStreak(db: Db, me: User, days: number): Promise<DevResult> {
  const n = Math.max(0, Math.min(999, Math.floor(days) || 0));
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  await db.updateUser(me.id, { streak: n, lastPlayedOn: n > 0 ? yesterday : null });
  return { ok: true, message: n === 0 ? 'Streak cleared' : `Streak ${n}, alive — next round extends it` };
}
