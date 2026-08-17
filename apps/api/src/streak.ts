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

/* Which "clue day" it is — the day key for 16A's one-free-tile-a-day rule.

   Not utcDay. The free tile is advertised as arriving "every day at 3pm", so the day it belongs to has
   to roll over at that hour, not at UTC midnight. Keying it to midnight created a dead window: with the
   drop at 20:00 UTC, a student in US Eastern had no free tile from 8pm until 4pm the next day — most of
   their waking hours — because "today's" hadn't arrived yet and yesterday's key had already rolled.

   Shifting the boundary instead of gating on the hour means there is always a current clue day, exactly
   one free tile inside it, and the reset lands at the advertised time. It's also testable, which a
   wall-clock hour check was not. */
export function clueDay(hourUtc: number, now = new Date()): string {
  const shifted = new Date(now.getTime() - hourUtc * 3600_000);
  return utcDay(shifted);
}

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
