import type { Db, User } from './db';
import { notBlocked } from './pollRound';
import type { Tuning } from './tuning';

/* The Ranks board (12A / README §5).

   Three scopes, all school-scoped:
     overall  — this week
     grade    — this week, restricted to the caller's own grade
     trending — the last 24 hours ("Hottest")

   The week runs Sunday→Sunday in UTC, matching 10A's "the board resets every Sunday night". UTC
   rather than per-user local time on purpose: a leaderboard everyone is comparing has to reset at the
   same instant for everybody, or two students see different standings on Sunday evening. */

export type BoardScope = 'overall' | 'grade' | 'trending';

export type BoardEntry = {
  rank: number;
  userId: string;
  name: string;
  grade: string | null;
  flames: number;
  blocked: boolean;
};

export type Board = {
  entries: BoardEntry[];
  me: BoardEntry | null;
  flamesToTopTen: number | null;
  resetsAt: string;
  scope: BoardScope;
  /** People at the school, and the count it takes to unlock the board. */
  memberCount: number;
  unlockThreshold: number;
  unlocked: boolean;
};


/* A public leaderboard needs a crowd to be a leaderboard. Below this, "most flames at your school" is
   a ranking of nearly everybody who's joined — which is useless as social proof and actively unkind in
   a group small enough that everyone can infer who's who. So the board stays locked until the school
   reaches this many people, and the screen shows the progress instead.

   Voting and flames deliberately keep working below it: the way a school reaches the threshold is the
   people already there using the app and inviting others, so locking the loop itself would be
   self-defeating. The small-school privacy problem is handled separately, by the anonymity floor in
   flames.ts. The threshold itself is tuning.schoolUnlockThreshold. */

/** Start of the current UTC Sunday. */
export function weekStart(now = new Date()): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay()); // getUTCDay(): 0 = Sunday
  return d;
}

/** Start of the *next* UTC Sunday — what the "⏳ 2d left" pill counts down to. */
export function weekEnd(now = new Date()): Date {
  const start = weekStart(now);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return end;
}

export async function boardFor(db: Db, user: User, scope: BoardScope, tuning: Tuning): Promise<Board> {
  const now = new Date();
  const resetsAt = weekEnd(now).toISOString();
  const base = {
    resetsAt,
    scope,
    memberCount: 0,
    unlockThreshold: tuning.schoolUnlockThreshold,
    unlocked: false
  };
  const empty: Board = { entries: [], me: null, flamesToTopTen: null, ...base };
  if (!user.schoolId) return empty;

  const memberCount = await db.countSchoolUsers(user.schoolId as string);
  const unlocked = memberCount >= tuning.schoolUnlockThreshold;
  /* Returns no rows at all while locked, rather than trusting the client to hide them — the standings
     are the thing being withheld, so they must not be in the payload. */
  if (!unlocked) return { ...empty, memberCount, unlocked };

  const since = scope === 'trending' ? new Date(now.getTime() - 86400_000) : weekStart(now);
  const grade = scope === 'grade' ? (user.grade as string | null) : null;
  // A grade-scoped board for someone with no grade on file would silently read as the whole school.
  if (scope === 'grade' && !grade) return empty;

  const rows = await db.getBoard(user.schoolId as string, since.toISOString(), grade ?? undefined);

  /* Identity masking is viewer-relative and happens here, after ranking — see the getBoard comment.
     Mutual, like everywhere else: someone who blocked *you* is masked too, since the point is that
     you and they don't surface to each other. */
  const blockedIds = new Set<string>();
  if (rows.length > 0) {
    const listed = await db.getUsersByIds(rows.map(r => r.userId));
    for (const other of listed) if (!notBlocked(user, other)) blockedIds.add(other.id);
  }

  const ranked: BoardEntry[] = rows.map((r, i) => {
    const blocked = blockedIds.has(r.userId);
    const name = [r.firstName, r.lastName].filter(Boolean).join(' ').trim();
    return {
      rank: i + 1,
      userId: r.userId,
      // Rank and score survive; the name does not. Never the real name for a blocked row.
      name: blocked ? 'Blocked' : name || 'Someone',
      grade: blocked ? null : r.grade,
      flames: r.flames,
      blocked
    };
  });

  const mine = ranked.find(e => e.userId === user.id) ?? null;

  /* "6 more flames cracks the top 10" — the gap to 10th place, +1 because matching 10th place on
     score doesn't overtake it (ties break on id, not in your favour). Null when the caller is
     already inside the tier, or when the board has fewer than ten ranked people and any flame at all
     is enough to get in. */
  let flamesToTopTen: number | null = null;
  const tenth = ranked[tuning.boardTopTier - 1];
  if (tenth && (!mine || mine.rank > tuning.boardTopTier)) {
    flamesToTopTen = tenth.flames + 1 - (mine?.flames ?? 0);
  }

  return {
    entries: ranked.slice(0, tuning.boardLimit),
    // The caller's own row is pinned regardless of whether it made the returned slice.
    me: mine,
    flamesToTopTen,
    ...base,
    memberCount,
    unlocked
  };
}
