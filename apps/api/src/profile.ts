import type { Db } from './db';
import type { Tuning } from './tuning';

/* 13A's "what you've won" chips: the prompts someone has been picked for, most-picked first.

   Scoped to the same 30-day window the Inbox uses, so a chip can't outlive the auras behind it —
   a trophy for a prompt whose auras have all expired would be a number with nothing to back it. */
export type Superlative = { emoji: string; text: string; color: string; count: number };

export async function superlativesFor(db: Db, userId: string, tuning: Tuning): Promise<Superlative[]> {
  const since = new Date(Date.now() - tuning.auraLifetimeDays * 86400_000).toISOString();
  const rows = await db.getAuraCountsByPoll(userId, since);
  return rows.map(r => ({ emoji: r.emoji, text: r.text, color: r.color, count: r.n }));
}
