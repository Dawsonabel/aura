/* Ports server.js's buildRound() (school/friend-pool selection + boost insertion) exactly, with
   one architectural change: round state goes to Redis (rounds.ts) instead of an in-memory object,
   since Workers have no persistent memory between requests and Redis gives native TTL expiry
   instead of the manual 6h-prune loop the original needs. */
import type { Db, User } from './db';
import type { RoundStore } from './rounds';
import { utcDay } from './streak';
import type { Tuning } from './tuning';

export type RoundChoice = { id: string; name: string; grade?: string | null; boosted?: boolean };
export type RoundPoll = { questionId: string; emoji: string; text: string; color: string; choices: RoundChoice[] };
export type BuiltRound = { roundId: string; polls: RoundPoll[]; canPlay: boolean; boostedInserts: number };
export type ServedRound = BuiltRound & {
  roundsLeft: number;
  dailyLimit: number;
  nextRoundAt: string;
  rerollCost: number;
  roundPayout: number;
  followWeightFactor: number;
};

/** One candidate as the client sees them. Grade included so the card's meta line isn't invented. */
function toChoice(u: User, boosted = false): RoundChoice {
  return {
    id: u.id,
    name: `${u.firstName} ${u.lastName}`,
    grade: (u.grade as string | null) || null,
    ...(boosted ? { boosted: true } : {})
  };
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function notBlocked(a: User, b: User): boolean {
  const ab = (a.blocked as string[]) || [];
  const bb = (b.blocked as string[]) || [];
  return !ab.includes(b.id) && !bb.includes(a.id);
}
/* Exported because report resolution notifies the reporter too (8A: "You'll get a flame-style note
   when it's closed"). Same 30-item cap and unread default as the round notifications. */
export async function notify(db: Db, user: User, text: string, emoji: string): Promise<void> {
  const notifications = [
    { id: 'ntf_' + crypto.randomUUID().slice(0, 12), text, emoji, ts: new Date().toISOString(), read: false },
    ...(((user.notifications as unknown[]) || []))
  ].slice(0, 30);
  await db.updateUser(user.id, { notifications });
}

/* Rationing exists because an unlimited supply made "today's round" untrue, made the board farmable by
   replaying, and removed every reason to come back tomorrow. The tbh/Gas shape is: a finite stack, then
   you're out — which is also the moment an invite prompt actually converts.

   The numbers themselves live in tuning.ts and arrive as a parameter, so they can be changed from the
   Cloudflare dashboard without a deploy. */

/* Candidate weighting. Following someone is a statement that you care who they are, so they should
   turn up more often — but never *exclusively*, which is what the old `friends.length >= 4 ? friends :
   mates` rule did. That rule had a cliff: your 4th follow silently replaced the entire school with four
   people, and everyone below it saw pure strangers. Weights degrade smoothly instead.

   The three numbers live in tuning.ts, because the People screen prints the ratio ("3× likelier to show
   up in your four") and a constant here plus a literal there is two copies of one rule. */
function weightsFor(user: User, mates: User[], tuning: Tuning): { user: User; weight: number }[] {
  const following = new Set((user.following as string[]) || []);
  /* Followers count too, but less: someone following you is a weaker signal about who *you* want to
     see than someone you chose to follow. Read from their row rather than a stored follower list, so
     there's one source of truth for the edge. */
  const followsMe = new Set(mates.filter(m => ((m.following as string[]) || []).includes(user.id)).map(m => m.id));
  return mates.map(m => ({
    user: m,
    weight: following.has(m.id)
      ? tuning.weightFollowing
      : followsMe.has(m.id)
        ? tuning.weightFollower
        : tuning.weightSchoolmate
  }));
}

/** How many times likelier a followed classmate is than a stranger — the number the People copy prints. */
export function followWeightFactor(tuning: Tuning): number {
  if (tuning.weightSchoolmate <= 0) return tuning.weightFollowing;
  return Math.max(1, Math.round(tuning.weightFollowing / tuning.weightSchoolmate));
}

/** Four distinct people, sampled with the weights above. */
function weightedPick(pool: { user: User; weight: number }[], n: number): User[] {
  const remaining = pool.map(p => ({ ...p }));
  const picked: User[] = [];
  while (picked.length < n && remaining.length > 0) {
    const total = remaining.reduce((sum, p) => sum + p.weight, 0);
    let roll = Math.random() * total;
    let index = remaining.length - 1;
    for (let i = 0; i < remaining.length; i++) {
      roll -= remaining[i].weight;
      if (roll <= 0) {
        index = i;
        break;
      }
    }
    picked.push(remaining[index].user);
    // Sampled without replacement, so one person can't fill two slots in the same question.
    remaining.splice(index, 1);
  }
  return picked;
}

export async function buildRound(db: Db, rounds: RoundStore, user: User, tuning: Tuning): Promise<BuiltRound> {
  const mates = (await db.getUsersBySchool(user.schoolId, user.id)).filter(m => notBlocked(user, m));
  const weighted = weightsFor(user, mates, tuning);
  const pool = mates;

  const allPolls = await db.getPolls();
  const enabled = allPolls.filter(p => p.enabled && (p.schoolId === null || p.schoolId === user.schoolId));
  const qs = shuffle(enabled).slice(0, tuning.questionsPerRound);

  const candidateBoosts = await db.getCandidateBoosts(user.id);
  const boosterIds = [...new Set(candidateBoosts.map(b => b.byUserId))];
  const boosters = await db.getUsersByIds(boosterIds);
  const boosterOf = new Map(boosters.map(u => [u.id, u]));
  // Local mutable copy: remaining decrements need to be checked *within* this single round build
  // (up to MAX_BOOST_PER_ROUND times), same as server.js mutating the same in-memory objects.
  const applicable = candidateBoosts
    .filter(b => {
      const bu = boosterOf.get(b.byUserId);
      return bu && notBlocked(user, bu) && (b.targetId === user.id || (b.targetId === null && bu.schoolId === user.schoolId));
    })
    .map(b => ({ ...b }));

  let boostedInserts = 0;
  const MAX_BOOST_PER_ROUND = tuning.maxBoostPerRound;
  const boosters_used = new Set<string>();
  const decrements: string[] = [];

  const polls: RoundPoll[] = qs.map(q => {
    const choices: RoundChoice[] = weightedPick(weighted, 4).map(c => toChoice(c));
    if (boostedInserts < MAX_BOOST_PER_ROUND) {
      const b = applicable.find(x => x.remaining > 0);
      if (b) {
        const bu = boosterOf.get(b.byUserId);
        if (bu && !choices.some(c => c.id === bu.id)) {
          choices[Math.floor(Math.random() * 4)] = toChoice(bu, true);
          b.remaining--;
          decrements.push(b.id);
          boostedInserts++;
          boosters_used.add(bu.id);
        }
      }
    }
    return { questionId: q.id, emoji: q.emoji, text: q.text, color: q.color, choices };
  });

  await Promise.all(decrements.map(id => db.decrementBoost(id)));

  if (boostedInserts > 0 && user.godMode) {
    const n = boosters_used.size;
    await notify(db, user, n > 1 ? `${n} people added themselves to your polls 👀` : 'Someone added themselves to your polls 👀', '👑');
  }

  const roundId = 'rnd_' + crypto.randomUUID().slice(0, 12);
  // Stored with the round so it can be resumed rather than rebuilt — see rounds.ts.
  await rounds.create(roundId, user.id, polls);

  return { roundId, polls, canPlay: pool.length >= 1, boostedInserts };
}

/* Four fresh candidates for one question of an existing round, for the paid reroll.

   Excludes whoever is currently on that card, so paying always visibly changes something — a reroll
   that could return the same four people would feel broken and be indistinguishable from a bug. */
export async function rerollChoices(db: Db, user: User, exclude: string[], tuning: Tuning): Promise<RoundChoice[]> {
  const mates = (await db.getUsersBySchool(user.schoolId, user.id)).filter(
    m => notBlocked(user, m) && !exclude.includes(m.id)
  );
  if (mates.length === 0) return [];
  return weightedPick(weightsFor(user, mates, tuning), 4).map(c => toChoice(c));
}

/** Next UTC midnight — when the daily allowance refills. */
function nextMidnight(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

/* What the Vote screen actually asks for.

   Three outcomes, in priority order:
     1. An unfinished round from today  -> resume it, unchanged.
     2. Allowance remaining             -> build a new one and count it.
     3. Out of rounds                   -> no polls, and when they come back.

   Resuming first is what makes the daily count honest. Before rounds were resumable, every mount of
   the Vote screen built a fresh one, so *any* per-day limit would have been spent by navigating rather
   than by playing — three taps on the tab and you'd be done for the day. */
export async function servedRound(db: Db, rounds: RoundStore, user: User, tuning: Tuning): Promise<ServedRound> {
  const today = utcDay();
  const sameDay = user.roundsPlayedOn === today;
  const used = sameDay ? (user.roundsToday as number) || 0 : 0;
  const meta = {
    dailyLimit: tuning.dailyRoundLimit,
    nextRoundAt: nextMidnight(),
    rerollCost: tuning.rerollCost,
    // Same branch completeRound pays out on, so the sheet's "earns N" matches what actually lands.
    roundPayout: user.godMode ? tuning.roundPayoutGodMode : tuning.roundPayout,
    followWeightFactor: followWeightFactor(tuning)
  };

  const currentId = sameDay ? (user.currentRoundId as string | null) : null;
  if (currentId) {
    const existing = await rounds.get(currentId);
    const unfinished =
      existing && existing.userId === user.id && !existing.claimed && existing.votedQ.length < existing.polls.length;
    if (unfinished) {
      return {
        roundId: currentId,
        polls: existing.polls,
        canPlay: existing.polls.length > 0,
        boostedInserts: 0,
        roundsLeft: Math.max(0, tuning.dailyRoundLimit - used),
        ...meta
      };
    }
  }

  if (used >= tuning.dailyRoundLimit) {
    return { roundId: '', polls: [], canPlay: false, boostedInserts: 0, roundsLeft: 0, ...meta };
  }

  const built = await buildRound(db, rounds, user, tuning);

  /* A round with no polls doesn't count against the allowance.

     It used to. A school with no questions enabled still got a round built — an empty one — and the
     counter incremented anyway, so three visits to the Vote tab at such a school spent the whole day
     and the screen switched from "no questions set up yet" to "that's your three", which was false
     twice over: nothing had been played, and nothing could be. Charging for an empty round is the
     same error as the pre-resumable version charging for a mount. */
  if (built.polls.length === 0) {
    return { ...built, roundsLeft: Math.max(0, tuning.dailyRoundLimit - used), ...meta };
  }

  await db.updateUser(user.id, { roundsPlayedOn: today, roundsToday: used + 1, currentRoundId: built.roundId });
  return { ...built, roundsLeft: Math.max(0, tuning.dailyRoundLimit - (used + 1)), ...meta };
}
