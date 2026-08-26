import type { Aura, FriendActivityEvent, FriendMilestone, Notification } from '@aura/api-client';

/* Everything the Aura tab derives from the two queries it already has, kept out of the screen so the
   screen stays layout.

   The important constraint running through all of it: these functions see the aura list, which
   carries a voter's gender but never an identity, and they must not turn a set of anonymous picks
   into a way of counting *people*. Every aggregate below is over picks, and the copy says "picks"
   wherever it can't honestly say people — `admirerCount` is the only person-count in the app and it
   is derived server-side precisely so voter ids never have to be here. */

export const DAY_MS = 86_400_000;

/** Local-calendar day key. Not the ISO date — "today" has to mean the user's today, not UTC's. */
export function dayKey(ts: string): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* How long until the flip allowance comes back, as "4hr 12m 09s".

   Counts to the next **UTC** midnight, because that's when the server resets it (see flipState in
   apps/api/src/auras.ts). Deriving it here from the device clock rather than shipping a timestamp is
   safe in the direction that matters: the clock only decides what this label *says*, never whether a
   flip is allowed, so a wrong device clock shows a wrong countdown and still can't mint a flip.

   Seconds always, even with hours to go: a number that visibly moves reads as a countdown, and one
   that sits still for a minute reads as a stuck screen. Zero-padded so the line doesn't jitter in
   width as the digits change. */
export function timeToReset(now = new Date()): string {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  const left = Math.max(0, next - now.getTime());
  const h = Math.floor(left / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  const s = Math.floor((left % 60_000) / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}hr ${pad(m)}m ${pad(s)}s` : `${m}m ${pad(s)}s`;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** "TODAY" / "YESTERDAY" / "19 AUG" — the section rules over the activity feed. */
export function dayLabel(key: string, now = new Date()): string {
  if (key === dayKey(now.toISOString())) return 'TODAY';
  if (key === dayKey(new Date(now.getTime() - DAY_MS).toISOString())) return 'YESTERDAY';
  const [y, m, d] = key.split('-').map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]}${y === now.getFullYear() ? '' : ` ${y}`}`;
}

export function withinDays(auras: Aura[], days: number, now = Date.now()): Aura[] {
  const cutoff = now - days * DAY_MS;
  return auras.filter(f => new Date(f.ts).getTime() >= cutoff);
}

/** The window *before* the one `withinDays` returns — the receipt's "vs last week" comparison. */
export function previousWindow(auras: Aura[], days: number, now = Date.now()): Aura[] {
  const end = now - days * DAY_MS;
  const start = end - days * DAY_MS;
  return auras.filter(f => {
    const t = new Date(f.ts).getTime();
    return t >= start && t < end;
  });
}

export type GenderSplit = { girls: number; boys: number; nb: number; unknown: number };

export function splitOf(auras: Aura[]): GenderSplit {
  const split: GenderSplit = { girls: 0, boys: 0, nb: 0, unknown: 0 };
  for (const f of auras) {
    if (f.gender === 'girl') split.girls++;
    else if (f.gender === 'boy') split.boys++;
    else if (f.gender === 'nonbinary') split.nb++;
    else split.unknown++;
  }
  return split;
}

/* Three functions lived here and all three are gone, for the same underlying reason: the Activity tab
   stopped summarising and started listing.

   `genderCounts` fed the card grid's filter chips. The filter went when the grid became one undivided
   stack.

   `pickedYouPhrase` ("19 girls, 13 boys and 6 non-binary picked you") and `allGendersWithheld` fed the
   split bar on the Activity header card, which is also gone. That card printed your 24-hour count, your
   streak and that sentence directly above the list those numbers were counting — every figure on it was
   obtainable by reading the rows underneath. Neither fact was lost with it: the streak is on Me and the
   Vote tab, and the gender split is still the Receipt's bar and footer.

   `splitOf` above survives because the Receipt genuinely needs it — a receipt is a summary by
   definition, and it's the one place in the tab where a total is the point rather than a spoiler. */

// ─────────────────────────────────────────────────────────────
// Activity feed
// ─────────────────────────────────────────────────────────────

export type ActivityItem =
  | {
      kind: 'pick';
      id: string;
      gender: string;
      emoji: string;
      color: string;
      /** The superlative. Free on your own card, and the thing that stops every row reading alike. */
      q: string;
      /** Set once you've flipped it — the feed says the name it cost a flip to learn. */
      name: string | null;
      /** How many times this sender has picked you, shown only when `repeat` is true. */
      pickCount: number;
      /** This is the newest card from its sender, so it's the one that carries the "N times" line. */
      repeat: boolean;
      /** Face down and never opened — the row you haven't spent anything on yet. */
      fresh: boolean;
      ts: string;
    }
  | {
      kind: 'friend';
      id: string;
      gender: string;
      friendId: string;
      friendName: string;
      /** The prompt and its emoji — same pair a `pick` row carries, now that the server sends them. */
      q: string;
      emoji: string;
      ts: string;
    }
  | {
      kind: 'milestone';
      id: string;
      friendId: string;
      friendName: string;
      /** 'streak' | 'superlative' */
      milestone: string;
      count: number;
      label: string;
      emoji: string;
      ts: string;
    }
  | { kind: 'note'; id: string; text: string; emoji: string; ts: string };

export type ActivityDay = { key: string; label: string; items: ActivityItem[] };

/* Who did what, as a sentence. "A girl gave you aura" / "A boy gave Emma aura".

   `Someone` covers three different silences with one word — a withheld cohort, a voter who chose
   "rather not say", and a protected sender — and that collapsing is deliberate: three distinct
   phrasings would let a reader tell which kind of hidden they were looking at, which is a fact about
   the voter that nobody bought.

   Non-binary gets a real phrase rather than falling into `Someone`. It's a longer line and it wraps
   on a narrow row, which is the correct trade: the alternative is a feed where a whole cohort is
   silently anonymised while girls and boys are named. */
const GENDER_ACTOR: Record<string, string> = {
  girl: 'A girl',
  boy: 'A boy',
  nonbinary: 'A non-binary person'
};

/* Mirrors `pickLine`, for a row about a friend rather than about you — and takes the prompt the same
   way, now that the server sends one. `q` stays optional in effect (empty string falls through to the
   bare line) because a vote cast before the poll's text was recorded still has to render. */
export function auraLine(gender: string, who: string, q = ''): string {
  const head = `${GENDER_ACTOR[gender] ?? 'Someone'} gave ${who} aura`;
  return q ? `${head} for ${q}` : head;
}

/* Your own row's subject. A flipped card says the name outright.

   That's the flip's reward showing up somewhere other than the card screen — you paid to learn it, so
   the feed should use it rather than going on calling her "a girl" forever. It also gives the feed a
   second reason to be scrolled: the named rows are the ones you already own, scattered among the ones
   you don't. */
export function pickActor(gender: string, name: string | null): string {
  return name ?? (GENDER_ACTOR[gender] ?? 'Someone');
}

/* "gave you aura for Best smile".

   ## The feed says this earlier than the card does, and that is deliberate

   A face-down card shows the poll's *emoji* but not its text — the back face in flip.tsx took the
   prompt off on the grounds that it was "the other side's to give". So a feed row is more specific
   than the card it opens, which is an asymmetry worth naming rather than leaving for someone to trip
   over: tapping "…for Would win a talent show" lands on a card that doesn't mention it.

   It stays because the prompt is the only per-row detail that reliably differs. Without it the feed
   is a screen of identical "A boy gave you aura" lines, which is the exact failure the ungrouped
   rewrite existed to fix — the variety has to come from somewhere, and this is the only free source.

   ## What it doesn't cost

   Nothing the flip sells. A flip buys the **name**; the prompt merely rode along with it. And there's
   no privacy cost either — the prompt is a fact about the *reader*, not the sender, so spelling it
   out narrows nothing about who picked you. (Contrast a friend row, where the prompt would be a fact
   about someone else — see friendActivityFor in the API.)

   If this ever needs to be consistent, the fix is to put the prompt back on the face-down card, not
   to strip it from here.

   Falls back to the bare line if a card somehow has no prompt text, rather than printing a dangling
   "for". */
export function pickLine(gender: string, name: string | null, q: string): string {
  const head = `${pickActor(gender, name)} gave you aura`;
  return q ? `${head} for ${q}` : head;
}

/* What a friend did. "Lucas is on a 10-day streak" / "Ava won Best smile with 5 aura votes".

   Present tense for the streak because it's a state that is currently true, not an event that
   happened — the row is dated to the day they last played, and "hit a 10-day streak" would read as a
   thing that occurred at that timestamp when in fact it's still running.

   ## Why the win count is spelled out rather than "×5"

   `×N` is the app's notation on the profile trophy chips, and it's right there — a chip is a label,
   read at a glance, and the count is a suffix on it. Dropped into a sentence it stops working: "Ava's
   won Best smile ×5" makes you re-parse twice, once because `'s` scans as a possessive before it
   resolves to "has", and again because `×5` is notation sitting where words are. Naming the unit
   ("aura votes") also says what the number counts, which the chip can get away with leaving implicit
   because it's sitting on a profile full of them.

   Pluralised even though MIN_WINS (see auras.ts) means the count is never 1 today. That floor is a
   tuning decision living in another file, and copy that reads "1 aura votes" the day somebody lowers
   it is the kind of bug nobody tests for. */
export function milestoneLine(item: {
  milestone: string;
  friendName: string;
  count: number;
  label: string;
}): string {
  if (item.milestone === 'streak') return `${item.friendName} is on a ${item.count}-day streak`;
  return `${item.friendName} won ${item.label} with ${item.count} aura vote${item.count === 1 ? '' : 's'}`;
}

/** "6th time 👀" — the repeat-admirer chip. Only ever rendered on a card where `repeat` is true. */
export function repeatChip(pickCount: number): string {
  return `${pickCount}${ordinalSuffix(pickCount)} time 👀`;
}

/** Exported for the leaderboard's rank rows, which need the same 11th/12th/13th handling. */
export function ordinalSuffix(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return 'th';
  if (n % 10 === 1) return 'st';
  if (n % 10 === 2) return 'nd';
  if (n % 10 === 3) return 'rd';
  return 'th';
}

/* The feed's ceiling. It merges an unbounded window of your picks with up to 60 friend events and
   30 notifications, and the screen renders it in a ScrollView rather than a list — so a busy student
   at a big school would otherwise mount several hundred rows to show the eight you read.

   Cutting from the tail is safe in a way that cutting the Cards grid never is: every pick is still in
   the grid, at full size, one segment away. This is a recency view, not the record. */
export const FEED_MAX_ITEMS = 60;

/* One row per event, newest first, sectioned by day.

   It used to be one row per *day*, collapsing everything you got into "19 girls and 13 boys picked
   you". That shape was chosen to avoid a timeline of anonymous strangers — but the summary answered
   the question in advance, and a feed that has already told you the total is one you have no reason
   to scroll. Ungrouped, the same picks arrive one at a time, and the friend rows interleave with them
   into something that reads like a room rather than a report.

   The gender split didn't survive as a row, but it isn't lost — the stat card above the feed still
   carries it for the last 24 hours, which is the one place a total is genuinely the point. */
export function activityFeed(
  auras: Aura[],
  friendEvents: FriendActivityEvent[],
  milestones: FriendMilestone[],
  notifications: Notification[],
  now = new Date()
): ActivityDay[] {
  const items: ActivityItem[] = [
    ...auras.map(
      (f): ActivityItem => ({
        kind: 'pick',
        // The aura's own id, so a row can open the card it's talking about.
        id: f.id,
        gender: f.gender,
        emoji: f.emoji,
        color: f.color,
        q: f.q,
        name: f.name,
        pickCount: f.pickCount,
        /* Both conditions matter. `newestFromSender` keeps the line on one card out of that sender's
           set (the server computes it — the client can't, see auras.ts), and `pickCount >= 2` is what
           makes it a repeat at all: "1st time 👀" is not a fact worth a chip. */
        repeat: f.newestFromSender && f.pickCount >= 2,
        // Never opened *and* never flipped — the only rows with something still to spend on.
        fresh: !f.opened && !f.name,
        ts: f.ts
      })
    ),
    ...friendEvents.map(
      (e): ActivityItem => ({
        kind: 'friend',
        id: e.id,
        gender: e.gender,
        friendId: e.friendId,
        friendName: e.friendName,
        q: e.label,
        emoji: e.emoji,
        ts: e.ts
      })
    ),
    ...milestones.map(
      (m): ActivityItem => ({
        kind: 'milestone',
        id: m.id,
        friendId: m.friendId,
        friendName: m.friendName,
        milestone: m.kind,
        count: m.count,
        label: m.label,
        emoji: m.emoji,
        ts: m.ts
      })
    ),
    ...notifications.map(
      (n): ActivityItem => ({ kind: 'note', id: n.id, text: n.text, emoji: n.emoji, ts: n.ts })
    )
  ];

  // Sorted globally, then capped, then bucketed — so the cap keeps the newest events across all three
  // sources rather than the newest of whichever list happened to be longest.
  items.sort((a, b) => (a.ts < b.ts ? 1 : -1));

  const byDay = new Map<string, ActivityItem[]>();
  for (const item of items.slice(0, FEED_MAX_ITEMS)) {
    const key = dayKey(item.ts);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(item);
    else byDay.set(key, [item]);
  }

  // Insertion order is already newest-day-first, since `items` was sorted before bucketing.
  return [...byDay.entries()].map(([key, dayItems]) => ({
    key,
    label: dayLabel(key, now),
    items: dayItems
  }));
}

/* "2 min ago" / "3 h ago" / "Tuesday" — the second line of an activity row.

   Calendar days, not 24-hour chunks. Rounding elapsed hours would let a row sitting under a
   "17 AUG" heading print "Yesterday", which is exactly the contradiction a reader notices. */
export function relativeTime(ts: string, now = Date.now()): string {
  const then = new Date(ts);
  const today = dayKey(new Date(now).toISOString());
  const key = dayKey(ts);
  if (key === today) {
    const mins = Math.max(0, Math.floor((now - then.getTime()) / 60_000));
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    return `${Math.floor(mins / 60)} h ago`;
  }
  if (key === dayKey(new Date(now - DAY_MS).toISOString())) return 'Yesterday';
  if (now - then.getTime() < 7 * DAY_MS) return then.toLocaleDateString(undefined, { weekday: 'long' });
  return then.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// ─────────────────────────────────────────────────────────────
// Receipt
// ─────────────────────────────────────────────────────────────

export type ReceiptItem = { key: string; item: string; qty: number; fill: string };

/** The design's ceiling: twelve lines, so nothing is ever hidden behind a "more" link. */
export const RECEIPT_MAX_LINES = 12;

/* Itemised by superlative, not by gender × grade.

   The design prints "GIRL · 11TH ×22". The grade only exists on a card you've flipped (see auras.ts),
   so a gender × grade receipt would be mostly blank — and where it wasn't, it would print the grades of
   the people you'd paid to identify onto a thing designed to be posted publicly. The superlative is
   free on every card, says nothing about who sent it, and is the more interesting line to post anyway.
   The gender split survives intact as the bar and the footer, which is where the design's colour
   actually reads.

   Anything past twelve rows collapses into one "AND N MORE" line rather than being dropped, so the
   rows still add up to the total printed underneath. */
export function receiptLines(auras: Aura[]): ReceiptItem[] {
  const groups = new Map<string, { qty: number; fill: string }>();
  for (const f of auras) {
    const g = groups.get(f.q);
    if (g) g.qty++;
    else groups.set(f.q, { qty: 1, fill: f.color || '#FF5CA8' });
  }
  const sorted = [...groups.entries()]
    .map(([item, g]) => ({ key: item, item: item.toUpperCase(), qty: g.qty, fill: g.fill }))
    .sort((a, b) => b.qty - a.qty || (a.item < b.item ? -1 : 1));

  if (sorted.length <= RECEIPT_MAX_LINES) return sorted;
  const head = sorted.slice(0, RECEIPT_MAX_LINES - 1);
  const rest = sorted.slice(RECEIPT_MAX_LINES - 1);
  const qty = rest.reduce((n, r) => n + r.qty, 0);
  return [...head, { key: '__more', item: `AND ${rest.length} MORE`, qty, fill: '#8B888D' }];
}

export type Period = 'day' | 'week' | 'month';

export const PERIODS: { key: Period; label: string; days: number; word: string; subtitle: string }[] = [
  { key: 'day', label: 'Last 24 hrs', days: 1, word: 'today', subtitle: 'LAST 24 HOURS' },
  { key: 'week', label: 'Last 7 days', days: 7, word: 'this week', subtitle: 'LAST 7 DAYS' },
  { key: 'month', label: 'Last 30 days', days: 30, word: 'this month', subtitle: 'LAST 30 DAYS' }
];

export function periodSpec(period: Period) {
  return PERIODS.find(p => p.key === period) ?? PERIODS[1];
}

/* "+41 VS LAST WEEK", and null for the 30-day view.

   Auras only go back 30 days (AURA_LIFETIME_DAYS), so the window before a 30-day window is empty
   rather than quiet — printing "-112 vs last month" off an empty comparison would be a lie the data
   can't see. */
export function periodDelta(auras: Aura[], period: Period, now = Date.now()): string | null {
  const spec = periodSpec(period);
  if (spec.days >= 30) return null;
  const current = withinDays(auras, spec.days, now).length;
  const previous = previousWindow(auras, spec.days, now).length;
  const diff = current - previous;
  const unit = spec.key === 'day' ? 'YESTERDAY' : 'LAST WEEK';
  return `${diff >= 0 ? '+' : ''}${diff} VS ${unit}`;
}

/** The closing line. Swaps with the period, and drops the brag when there's nothing to brag about. */
export function receiptCloser(total: number, period: Period): string {
  const { word } = periodSpec(period);
  if (total === 0) return `Quiet ${word} — that happens`;
  if (total < 5) return `A slow burn ${word}`;
  return `Woah, you were aura maxxing\n${word}`;
}

/* The shared copy. Names never appear — there are none in this string by construction, because it is
   built from counts and superlatives only. */
export function receiptShareText(
  total: number,
  split: GenderSplit,
  lines: ReceiptItem[],
  period: Period,
  school: string | null
): string {
  const spec = periodSpec(period);
  const head = `AURA RECEIPT · ${school ? `${school.toUpperCase()} · ` : ''}${spec.subtitle}`;
  const body = lines.map(l => `${l.item} ×${l.qty}`).join('\n');
  const hidden = split.unknown > 0 ? ` · ${split.unknown} HIDDEN` : '';
  const footer = `TOTAL ${total} — GIRLS ${split.girls} · BOYS ${split.boys} · NB ${split.nb}${hidden}`;
  return `${head}\n\n${body}\n\n${footer}\n\nwho picked you? getaura.app`;
}
