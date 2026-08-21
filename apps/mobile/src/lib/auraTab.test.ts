import { describe, test, expect } from 'vitest';
import type { Aura, FriendActivityEvent, FriendMilestone, Notification } from '@aura/api-client';
import {
  activityFeed,
  auraLine,
  dayKey,
  dayLabel,
  FEED_MAX_ITEMS,
  milestoneLine,
  periodDelta,
  pickActor,
  pickLine,
  previousWindow,
  receiptCloser,
  receiptLines,
  receiptShareText,
  RECEIPT_MAX_LINES,
  relativeTime,
  repeatChip,
  splitOf,
  timeToReset,
  withinDays,
  DAY_MS
} from './auraTab';

/* Fixtures are built with the local-time Date constructor, never ISO strings, because dayKey and the
   feed's day buckets are deliberately local-calendar ("today" means the user's today). An ISO literal
   would put fixtures on different calendar days depending on the machine running the suite. */
const NOW = new Date(2026, 7, 20, 15, 0, 0); // Aug 20 2026, 3pm local
const at = (daysAgo: number, hour = 12): string =>
  new Date(2026, 7, 20 - daysAgo, hour, 0, 0).toISOString();

function makeAura(over: Partial<Aura> = {}): Aura {
  return {
    id: 'aura_' + Math.random().toString(36).slice(2, 8),
    emoji: '🔥',
    q: 'Best smile',
    color: '#FF5CA8',
    gender: 'girl',
    grade: '',
    infiniteAura: false,
    unread: false,
    anonymous: false,
    name: null,
    repeatAdmirer: false,
    newestFromSender: true,
    pickCount: 1,
    ts: at(0),
    opened: false,
    detailHidden: false,
    ...over
  };
}

const friendEvent = (over: Partial<FriendActivityEvent> = {}): FriendActivityEvent => ({
  id: 'fev_1',
  ts: at(0),
  friendId: 'usr_f',
  friendName: 'Emma',
  gender: 'boy',
  ...over
});

const milestone = (over: Partial<FriendMilestone> = {}): FriendMilestone => ({
  id: 'ms_1',
  ts: at(0),
  friendId: 'usr_f',
  friendName: 'Lucas',
  kind: 'streak',
  count: 5,
  label: '',
  emoji: '',
  ...over
});

const note = (over: Partial<Notification> = {}): Notification => ({
  id: 'ntf_1',
  text: 'Round complete',
  emoji: '🎉',
  ts: at(0),
  read: false,
  ...over
});

// ─────────────────────────────────────────────────────────────
// Copy
// ─────────────────────────────────────────────────────────────

describe('feed copy', () => {
  test('the three named genders get their phrase; everything else collapses to Someone', () => {
    expect(auraLine('girl', 'Emma')).toBe('A girl gave Emma aura');
    expect(auraLine('boy', 'Emma')).toBe('A boy gave Emma aura');
    expect(auraLine('nonbinary', 'Emma')).toBe('A non-binary person gave Emma aura');
    // "private" covers withheld cohort, "rather not say" AND protected senders — one word, on purpose.
    expect(auraLine('private', 'Emma')).toBe('Someone gave Emma aura');
    expect(auraLine('', 'Emma')).toBe('Someone gave Emma aura');
  });

  test('a flipped card says the name you paid for instead of the gender', () => {
    expect(pickActor('girl', 'Sofia')).toBe('Sofia');
    expect(pickActor('girl', null)).toBe('A girl');
    expect(pickLine('girl', 'Sofia', 'Best smile')).toBe('Sofia gave you aura for Best smile');
  });

  test('a card with no prompt gets the bare line, not a dangling "for"', () => {
    expect(pickLine('boy', null, '')).toBe('A boy gave you aura');
  });

  test('milestone lines: present-tense streak, spelled-out win count', () => {
    expect(milestoneLine({ milestone: 'streak', friendName: 'Lucas', count: 10, label: '' })).toBe(
      'Lucas is on a 10-day streak'
    );
    expect(
      milestoneLine({ milestone: 'superlative', friendName: 'Ava', count: 5, label: 'Best smile' })
    ).toBe('Ava won Best smile with 5 aura votes');
  });

  test('a count of 1 reads "1 aura vote" — MIN_WINS lives in another file and can be lowered', () => {
    expect(
      milestoneLine({ milestone: 'superlative', friendName: 'Ava', count: 1, label: 'Best smile' })
    ).toBe('Ava won Best smile with 1 aura vote');
  });

  test('repeatChip ordinals, including the 11th–13th exceptions', () => {
    expect(repeatChip(2)).toBe('2nd time 👀');
    expect(repeatChip(3)).toBe('3rd time 👀');
    expect(repeatChip(4)).toBe('4th time 👀');
    expect(repeatChip(11)).toBe('11th time 👀');
    expect(repeatChip(12)).toBe('12th time 👀');
    expect(repeatChip(13)).toBe('13th time 👀');
    expect(repeatChip(21)).toBe('21st time 👀');
    expect(repeatChip(22)).toBe('22nd time 👀');
    expect(repeatChip(23)).toBe('23rd time 👀');
  });
});

// ─────────────────────────────────────────────────────────────
// activityFeed
// ─────────────────────────────────────────────────────────────

describe('activityFeed', () => {
  test('merges all four sources newest-first and sections them by local day', () => {
    const days = activityFeed(
      [makeAura({ id: 'a1', ts: at(0, 14) }), makeAura({ id: 'a2', ts: at(1, 10) })],
      [friendEvent({ id: 'f1', ts: at(0, 9) })],
      [milestone({ id: 'm1', ts: at(2, 12) })],
      [note({ id: 'n1', ts: at(0, 13) })],
      NOW
    );

    expect(days.map(d => d.label)).toEqual(['TODAY', 'YESTERDAY', '18 AUG']);
    // Within TODAY: 14:00 aura, 13:00 note, 9:00 friend event.
    expect(days[0].items.map(i => i.id)).toEqual(['a1', 'n1', 'f1']);
    expect(days[1].items.map(i => i.id)).toEqual(['a2']);
    expect(days[2].items.map(i => i.id)).toEqual(['m1']);
  });

  test('the cap keeps the newest items across sources, not per source', () => {
    // 70 old auras + 5 new friend events: the events must survive the cut.
    const auras = Array.from({ length: 70 }, (_, i) => makeAura({ id: `a${i}`, ts: at(3, 1) }));
    const events = Array.from({ length: 5 }, (_, i) => friendEvent({ id: `f${i}`, ts: at(0, 10) }));

    const days = activityFeed(auras, events, [], [], NOW);
    const items = days.flatMap(d => d.items);

    expect(items).toHaveLength(FEED_MAX_ITEMS);
    expect(items.slice(0, 5).every(i => i.kind === 'friend')).toBe(true);
  });

  test('repeat needs both the newest card from that sender AND a pickCount of 2+', () => {
    const days = activityFeed(
      [
        makeAura({ id: 'newest', newestFromSender: true, pickCount: 3 }),
        makeAura({ id: 'older', newestFromSender: false, pickCount: 3 }),
        makeAura({ id: 'first-time', newestFromSender: true, pickCount: 1 })
      ],
      [], [], [],
      NOW
    );
    const byId = new Map(days[0].items.map(i => [i.id, i]));
    expect(byId.get('newest')).toMatchObject({ kind: 'pick', repeat: true });
    expect(byId.get('older')).toMatchObject({ kind: 'pick', repeat: false });
    expect(byId.get('first-time')).toMatchObject({ kind: 'pick', repeat: false });
  });

  test('fresh means never opened and never flipped', () => {
    const days = activityFeed(
      [
        makeAura({ id: 'untouched', opened: false, name: null }),
        makeAura({ id: 'opened', opened: true, name: null }),
        makeAura({ id: 'flipped', opened: false, name: 'Sofia' })
      ],
      [], [], [],
      NOW
    );
    const byId = new Map(days[0].items.map(i => [i.id, i]));
    expect(byId.get('untouched')).toMatchObject({ fresh: true });
    expect(byId.get('opened')).toMatchObject({ fresh: false });
    expect(byId.get('flipped')).toMatchObject({ fresh: false });
  });
});

// ─────────────────────────────────────────────────────────────
// Day math and labels
// ─────────────────────────────────────────────────────────────

describe('day windows', () => {
  test('dayLabel appends the year only when it differs from now', () => {
    expect(dayLabel('2026-08-20', NOW)).toBe('TODAY');
    expect(dayLabel('2026-08-19', NOW)).toBe('YESTERDAY');
    expect(dayLabel('2026-08-01', NOW)).toBe('1 AUG');
    expect(dayLabel('2025-12-31', NOW)).toBe('31 DEC 2025');
  });

  test('withinDays includes the boundary; previousWindow excludes it', () => {
    const nowMs = NOW.getTime();
    const boundary = makeAura({ id: 'b', ts: new Date(nowMs - 7 * DAY_MS).toISOString() });
    const inside = makeAura({ id: 'in', ts: new Date(nowMs - DAY_MS).toISOString() });
    const before = makeAura({ id: 'pre', ts: new Date(nowMs - 8 * DAY_MS).toISOString() });
    const all = [boundary, inside, before];

    expect(withinDays(all, 7, nowMs).map(a => a.id)).toEqual(['b', 'in']);
    // The boundary vote is in the current window, so it must NOT also be in the previous one.
    expect(previousWindow(all, 7, nowMs).map(a => a.id)).toEqual(['pre']);
  });

  test('relativeTime uses calendar days, not 24-hour chunks', () => {
    const nowMs = NOW.getTime();
    expect(relativeTime(new Date(nowMs - 30_000).toISOString(), nowMs)).toBe('just now');
    expect(relativeTime(new Date(nowMs - 5 * 60_000).toISOString(), nowMs)).toBe('5 min ago');
    expect(relativeTime(new Date(nowMs - 3 * 3_600_000).toISOString(), nowMs)).toBe('3 h ago');
    // 11pm yesterday is 16 hours ago — calendar-wise still "Yesterday", never "16 h ago".
    expect(relativeTime(at(1, 23), nowMs)).toBe('Yesterday');
    // Within a week: a weekday name. Aug 17 2026 is a Monday.
    expect(relativeTime(at(3), nowMs)).toMatch(/^(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day$/);
  });

  test('timeToReset counts to UTC midnight, zero-padded, dropping hours at zero', () => {
    expect(timeToReset(new Date(Date.UTC(2026, 7, 20, 19, 55, 51)))).toBe('4hr 04m 09s');
    expect(timeToReset(new Date(Date.UTC(2026, 7, 20, 23, 58, 30)))).toBe('1m 30s');
  });
});

// ─────────────────────────────────────────────────────────────
// Receipt
// ─────────────────────────────────────────────────────────────

describe('receipt', () => {
  test('groups by superlative, most-picked first, alphabetical on ties', () => {
    const lines = receiptLines([
      makeAura({ q: 'Best smile', color: '#111111' }),
      makeAura({ q: 'Best smile', color: '#222222' }),
      makeAura({ q: 'Funniest', color: '#333333' }),
      makeAura({ q: 'Coolest', color: '#444444' })
    ]);
    expect(lines.map(l => `${l.item} x${l.qty}`)).toEqual([
      'BEST SMILE x2',
      'COOLEST x1',
      'FUNNIEST x1'
    ]);
    // The fill is the first card's color for that prompt.
    expect(lines[0].fill).toBe('#111111');
  });

  test('past twelve lines the tail collapses into AND N MORE, so quantities still sum to the total', () => {
    const auras = Array.from({ length: 15 }, (_, i) =>
      makeAura({ q: `Prompt ${String.fromCharCode(65 + i)}` })
    );
    const lines = receiptLines(auras);

    expect(lines).toHaveLength(RECEIPT_MAX_LINES);
    const more = lines[lines.length - 1];
    expect(more.item).toBe('AND 4 MORE');
    expect(lines.reduce((n, l) => n + l.qty, 0)).toBe(15);
  });

  test('periodDelta signs the diff and goes silent on the 30-day view', () => {
    const nowMs = NOW.getTime();
    const auras = [
      makeAura({ ts: at(0, 10) }),
      makeAura({ ts: at(0, 11) }),
      makeAura({ ts: new Date(nowMs - 30 * 3_600_000).toISOString() }) // 30h ago = "yesterday" window
    ];
    expect(periodDelta(auras, 'day', nowMs)).toBe('+1 VS YESTERDAY');
    expect(periodDelta([auras[2]], 'day', nowMs)).toBe('-1 VS YESTERDAY');
    // Auras only live 30 days, so a "vs last month" comparison would be against a blind spot.
    expect(periodDelta(auras, 'month', nowMs)).toBeNull();
  });

  test('the closer drops the brag when there is nothing to brag about', () => {
    expect(receiptCloser(0, 'week')).toBe('Quiet this week — that happens');
    expect(receiptCloser(3, 'day')).toBe('A slow burn today');
    expect(receiptCloser(9, 'week')).toContain('aura maxxing');
  });

  test('share text carries counts and prompts only, and hides the HIDDEN segment at zero', () => {
    const split = splitOf([
      makeAura({ gender: 'girl' }),
      makeAura({ gender: 'boy' }),
      makeAura({ gender: 'private' })
    ]);
    expect(split).toEqual({ girls: 1, boys: 1, nb: 0, unknown: 1 });

    const withHidden = receiptShareText(3, split, receiptLines([makeAura()]), 'week', 'Aura High');
    expect(withHidden).toContain('AURA RECEIPT · AURA HIGH · LAST 7 DAYS');
    expect(withHidden).toContain('BEST SMILE ×1');
    expect(withHidden).toContain('GIRLS 1 · BOYS 1 · NB 0 · 1 HIDDEN');

    const noHidden = receiptShareText(2, { girls: 1, boys: 1, nb: 0, unknown: 0 }, [], 'week', null);
    expect(noHidden).not.toContain('HIDDEN');
    expect(noHidden).not.toContain('·  ·');
  });
});
