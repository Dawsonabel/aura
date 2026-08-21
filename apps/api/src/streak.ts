import type { User } from './db';

/* Daily play streak.

   Added because 3A's Vote header and 13A's Profile both show "🔥 12 day streak" and there was no
   streak anywhere in the API — the number on screen was a hardcoded placeholder sitting on the app's
   two most-visited surfaces. A visible invented number is the cheapest possible way to lose a user's
   trust in every other number.

   Stored as a count plus the UTC date it was last advanced. Dates, not timestamps: a streak is "did
   you play today", and comparing calendar days is the only way that question has a stable answer.
   UTC rather than device-local so travelling or changing timezone can't mint or break a streak — the
   same reason the Ranks week is UTC. */

export type StreakState = { streak: number; lastPlayedOn: string | null };

/** YYYY-MM-DD in UTC. */
export function utcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/* YYYY-MM-DDTHH in UTC — the round allowance's period key.

   Same shape as utcDay and used the same way: store the key alongside the count, compare on read, and
   a mismatch means the period rolled and the count starts again. Nothing runs on the hour to reset
   anything. */
export function utcHour(now = new Date()): string {
  return now.toISOString().slice(0, 13);
}

/** The instant the current hour ends — when the round allowance comes back. */
export function nextHour(now = new Date()): string {
  const d = new Date(now);
  d.setUTCMinutes(0, 0, 0);
  d.setUTCHours(d.getUTCHours() + 1);
  return d.toISOString();
}

/* `clueDay` lived here — the day key for the one-free-scratch-tile-a-day rule, shifted off UTC
   midnight so the reset landed at the advertised 3pm. The clue ladder is gone and nothing needs a
   shifted day boundary any more: the flip allowance resets at UTC midnight like the streak, which is
   what its copy says. */

function dayBefore(day: string): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return utcDay(d);
}

/* What the streak becomes when a round is completed.

   Returns null when nothing should change — completing a second round on the same day must not
   advance it, and that's a return value rather than a write so the caller can skip the update. */
export function advanceStreak(user: User, now = new Date()): StreakState | null {
  const today = utcDay(now);
  const last = typeof user.lastPlayedOn === 'string' ? user.lastPlayedOn : null;
  if (last === today) return null;
  const current = typeof user.streak === 'number' ? user.streak : 0;
  // Consecutive day continues the run; any longer gap starts a new one at 1.
  const streak = last === dayBefore(today) ? current + 1 : 1;
  return { streak, lastPlayedOn: today };
}

/* What to *display*, which is not the same as what's stored: a stored streak goes stale the moment a
   day is missed, and nothing runs at midnight to reset it. So a streak is only alive if it was last
   advanced today or yesterday — otherwise it reads as 0 no matter what's on the row. */
export function currentStreak(user: User, now = new Date()): number {
  const last = typeof user.lastPlayedOn === 'string' ? user.lastPlayedOn : null;
  if (!last) return 0;
  const today = utcDay(now);
  if (last !== today && last !== dayBefore(today)) return 0;
  return typeof user.streak === 'number' ? user.streak : 0;
}
