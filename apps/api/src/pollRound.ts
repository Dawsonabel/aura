/* Ports server.js's buildRound() (school/friend-pool selection + boost insertion) exactly, with
   one architectural change: round state goes to Redis (rounds.ts) instead of an in-memory object,
   since Workers have no persistent memory between requests and Redis gives native TTL expiry
   instead of the manual 6h-prune loop the original needs. */
import type { Db, User } from './db';
import type { RoundStore } from './rounds';

export type RoundChoice = { id: string; name: string; boosted?: boolean };
export type RoundPoll = { questionId: string; emoji: string; text: string; color: string; choices: RoundChoice[] };
export type BuiltRound = { roundId: string; polls: RoundPoll[]; canPlay: boolean; boostedInserts: number };

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
async function notify(db: Db, user: User, text: string, emoji: string): Promise<void> {
  const notifications = [
    { id: 'ntf_' + crypto.randomUUID().slice(0, 12), text, emoji, ts: new Date().toISOString(), read: false },
    ...(((user.notifications as unknown[]) || []))
  ].slice(0, 30);
  await db.updateUser(user.id, { notifications });
}

export async function buildRound(db: Db, rounds: RoundStore, user: User): Promise<BuiltRound> {
  const mates = (await db.getUsersBySchool(user.schoolId, user.id)).filter(m => notBlocked(user, m));
  const friendIds = (user.friendIds as string[]) || [];
  const friends = mates.filter(m => friendIds.includes(m.id));
  const pool = friends.length >= 4 ? friends : mates;

  const allPolls = await db.getPolls();
  const enabled = allPolls.filter(p => p.enabled && (p.schoolId === null || p.schoolId === user.schoolId));
  const qs = shuffle(enabled).slice(0, 12);

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
  const MAX_BOOST_PER_ROUND = 4;
  const boosters_used = new Set<string>();
  const decrements: string[] = [];

  const polls: RoundPoll[] = qs.map(q => {
    const choices: RoundChoice[] = shuffle(pool).slice(0, 4).map(c => ({ id: c.id, name: `${c.firstName} ${c.lastName}` }));
    if (boostedInserts < MAX_BOOST_PER_ROUND) {
      const b = applicable.find(x => x.remaining > 0);
      if (b) {
        const bu = boosterOf.get(b.byUserId);
        if (bu && !choices.some(c => c.id === bu.id)) {
          choices[Math.floor(Math.random() * 4)] = { id: bu.id, name: `${bu.firstName} ${bu.lastName}`, boosted: true };
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
  await rounds.create(roundId, user.id);

  return { roundId, polls, canPlay: pool.length >= 1, boostedInserts };
}
