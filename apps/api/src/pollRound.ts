/* Ports server.js's buildRound() (school/friend-pool selection + boost insertion) exactly, with
   one architectural change: round state goes to Redis (rounds.ts) instead of an in-memory object,
   since Workers have no persistent memory between requests and Redis gives native TTL expiry
   instead of the manual 6h-prune loop the original needs. */
import type { Db, User } from './db';
import type { RoundStore } from './rounds';
import { nextHour, utcHour } from './streak';
import type { Tuning } from './tuning';

export type RoundChoice = { id: string; name: string; grade?: string | null; boosted?: boolean };
export type RoundPoll = { questionId: string; emoji: string; text: string; color: string; choices: RoundChoice[] };
export type BuiltRound = { roundId: string; polls: RoundPoll[]; canPlay: boolean; boostedInserts: number };
export type ServedRound = BuiltRound & {
  roundsLeft: number;
  roundsPerHour: number;
  nextRoundAt: string;
  rerollCost: number;
  votePayout: number;
  answeredQuestionIds: string[];
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
/* Exported because report resolution notifies the reporter too (8A: "You'll get a aura-style note
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

/* Candidate weighting. A friend is someone you both chose, so they should turn up more often — but
   never *exclusively*, which is what the old `friends.length >= 4 ? friends : mates` rule did. That
   rule had a cliff: your 4th friend silently replaced the entire school with four people, and everyone
   below it saw pure strangers. Weights degrade smoothly instead.

   One weight now, not two. Following was one-directional, so it had a stronger number for people you
   followed and a weaker one for people who followed you — a friendship is symmetric and there is no
   second case to price. Pending requests are worth nothing: a request you sent says something about
   who you want to see, but honouring it would leak the request into their round as an unexplained
   uptick in how often they see you.

   The numbers live in tuning.ts, because the People screen prints the ratio ("3× likelier to show up
   in your four") and a constant here plus a literal there is two copies of one rule. */
function weightsFor(user: User, mates: User[], tuning: Tuning): { user: User; weight: number }[] {
  const friends = new Set((user.friends as string[]) || []);
  return mates.map(m => ({
    user: m,
    weight: friends.has(m.id) ? tuning.weightFriend : tuning.weightSchoolmate
  }));
}

/** How many times likelier a friend is than a stranger — the number the People copy prints. */
export function followWeightFactor(tuning: Tuning): number {
  if (tuning.weightSchoolmate <= 0) return tuning.weightFriend;
  return Math.max(1, Math.round(tuning.weightFriend / tuning.weightSchoolmate));
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

  if (boostedInserts > 0 && user.infiniteAura) {
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

/* What the Vote screen actually asks for.

   Three outcomes, in priority order:
     1. An unfinished round from this hour -> resume it, unchanged.
     2. Allowance remaining                -> build a new one and count it.
     3. Out of rounds                      -> no polls, and when they come back.

   Resuming first is what makes the count honest. Before rounds were resumable, every mount of the Vote
   screen built a fresh one, so *any* limit would have been spent by navigating rather than by playing —
   a few taps on the tab and you'd be done.

   The period is an hour (see roundsPerHour in tuning.ts). `roundsOn` holds the hour key the count
   belongs to and a mismatch resets it, so nothing has to run on the hour. The old daily fields
   (`roundsPlayedOn`, `roundsToday`) are no longer read; a user carrying them simply starts this hour
   at zero, which is the correct answer anyway. */
export async function servedRound(db: Db, rounds: RoundStore, user: User, tuning: Tuning): Promise<ServedRound> {
  const hour = utcHour();
  const sameHour = user.roundsOn === hour;
  const used = sameHour ? (user.roundsInHour as number) || 0 : 0;
  const meta = {
    roundsPerHour: tuning.roundsPerHour,
    nextRoundAt: nextHour(),
    rerollCost: tuning.rerollCost,
    votePayout: tuning.votePayout,
    followWeightFactor: followWeightFactor(tuning)
  };

  /* What a *finished* round is worth end to end — every question's per-vote payout plus the completion
     bonus. 14A's "can't afford" sheet leads with "Finish this round · earns N", and it's shown to
     someone who hasn't started voting, so N has to be the whole round rather than whichever half is
     left to collect.

     Counted off the round's *actual* length, not questionsPerRound. A round is capped at that dial but
     can be shorter — it only ever contains polls that exist and are enabled — so a school with six
     questions running against a cap of ten would have been promised four votes' worth of pay that the
     round had no questions to give. The dial is the ceiling; the round is the fact. */
  const bonus = user.infiniteAura ? tuning.roundBonusInfiniteAura : tuning.roundBonus;
  const payoutFor = (questionCount: number) => tuning.votePayout * questionCount + bonus;

  /* Resumable only within the hour that built it. A round left half-finished when the clock rolls is
     abandoned rather than resumed — the allowance it was drawn against has already been refilled, so
     resuming it would hand out the old round *and* a new one. */
  const currentId = sameHour ? (user.currentRoundId as string | null) : null;
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
        roundsLeft: Math.max(0, tuning.roundsPerHour - used),
        roundPayout: payoutFor(existing.polls.length),
        answeredQuestionIds: existing.votedQ,
        ...meta
      };
    }
  }

  if (used >= tuning.roundsPerHour) {
    return { roundId: '', polls: [], canPlay: false, boostedInserts: 0, roundsLeft: 0, roundPayout: payoutFor(tuning.questionsPerRound), answeredQuestionIds: [], ...meta };
  }

  const built = await buildRound(db, rounds, user, tuning);

  /* A round with no polls doesn't count against the allowance.

     It used to. A school with no questions enabled still got a round built — an empty one — and the
     counter incremented anyway, so visiting the Vote tab at such a school spent the allowance and the
     screen switched from "no questions set up yet" to "that's your round", which was false twice over:
     nothing had been played, and nothing could be. Charging for an empty round is the same error as
     the pre-resumable version charging for a mount. */
  if (built.polls.length === 0) {
    return { ...built, roundsLeft: Math.max(0, tuning.roundsPerHour - used), roundPayout: payoutFor(tuning.questionsPerRound), answeredQuestionIds: [], ...meta };
  }

  await db.updateUser(user.id, { roundsOn: hour, roundsInHour: used + 1, currentRoundId: built.roundId });
  return { ...built, roundsLeft: Math.max(0, tuning.roundsPerHour - (used + 1)), roundPayout: payoutFor(built.polls.length), answeredQuestionIds: [], ...meta };
}
