import type { Db, User } from './db';

/* Expo push delivery for 7A. Three kinds, matching the three toggles the design specifies — nothing
   else may ever be sent ("No streak nagging, no 'come back' begging" is a product promise, so the
   sender only accepts these).

   Delivery goes through Expo's push service rather than APNs/FCM directly: the tokens the app
   registers are ExponentPushToken[...] values, which only Expo can route. That also means this needs
   no APNs key in the Worker — the credentials live in the EAS project. */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export type PushKind = 'flame' | 'round' | 'friendJoined';

/* Which stored preference gates each kind, and what it defaults to when the user has never touched
   it. Defaults mirror the design's own switch states: flames and rounds on, friend-joined off. */
const PREFS: Record<PushKind, { field: string; fallback: boolean }> = {
  flame: { field: 'notifyFlames', fallback: true },
  round: { field: 'notifyRound', fallback: true },
  friendJoined: { field: 'notifyFriendJoined', fallback: false }
};

const QUIET_START_HOUR = 22; // "Nothing between 10pm and 7am"
const QUIET_END_HOUR = 7;

function prefEnabled(user: User, kind: PushKind): boolean {
  const { field, fallback } = PREFS[kind];
  const value = (user as Record<string, unknown>)[field];
  return typeof value === 'boolean' ? value : fallback;
}

/* True when it's currently quiet hours for this user.

   The server has no idea what timezone anyone is in, so the app sends its UTC offset along with the
   push token and it's stored beside it. A stored offset goes stale across a DST change, but the app
   re-registers on every launch, so it self-corrects within a session rather than drifting forever.
   With no offset on file we do NOT suppress — silently dropping a flame is worse than sending one an
   hour early. */
export function inQuietHours(user: User, now = new Date()): boolean {
  const enabled = (user as Record<string, unknown>).quietHours;
  if (enabled === false) return false;
  const offset = (user as Record<string, unknown>).tzOffsetMinutes;
  if (typeof offset !== 'number') return false;
  const localHour = new Date(now.getTime() + offset * 60_000).getUTCHours();
  return localHour >= QUIET_START_HOUR || localHour < QUIET_END_HOUR;
}

type ExpoTicket = { status: string; details?: { error?: string } };

/* Sends one notification to every device a user has registered. Never throws: a push failure must
   not turn a successful vote into an error response, and the caller is inside waitUntil anyway. */
export async function sendPush(
  db: Db,
  user: User,
  kind: PushKind,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  try {
    const tokens = ((user.pushTokens as string[]) || []).filter(t => typeof t === 'string' && t.length > 0);
    if (tokens.length === 0) return;
    if (!prefEnabled(user, kind)) return;
    if (inQuietHours(user)) return;

    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(
        tokens.map(to => ({
          to,
          title: 'AURA',
          body,
          sound: 'default',
          // Opens the right screen from a cold tap; the app reads this in its notification handler.
          data: { kind, ...data }
        }))
      )
    });
    if (!res.ok) return;

    /* Expo replies per-message. A token for an app that's been deleted or reinstalled comes back
       DeviceNotRegistered forever, so prune those — otherwise every future send retries dead tokens
       and the array grows without bound. */
    const json = (await res.json()) as { data?: ExpoTicket[] };
    const tickets = json.data ?? [];
    const dead = tokens.filter((_, i) => tickets[i]?.details?.error === 'DeviceNotRegistered');
    if (dead.length > 0) {
      await db.updateUser(user.id, { pushTokens: tokens.filter(t => !dead.includes(t)) });
    }
  } catch {
    // Intentionally swallowed — see the function comment.
  }
}

/* The daily "round is live" announcement, fired by the Worker's cron trigger (see wrangler.toml and
   the scheduled handler in index.ts).

   Why a cron at all: rounds are built on demand when a user opens the Vote screen, so there is no
   server-side moment where a round "goes live" to hook into. The design's second notification is
   genuinely an announcement — it's what creates the moment rather than reporting one.

   Two known limits, both fine for now and both worth revisiting before a wide launch: it fires at one
   fixed UTC time, so "3:15pm" is only true in one timezone (quiet hours still respect each user's own
   offset), and it sends one HTTP request per user rather than batching up to Expo's 100-message
   limit. */
export async function sendRoundAnnouncement(db: Db): Promise<void> {
  const users = await db.getAllUsers();
  const schools = new Map((await db.getSchoolsWithUserCounts()).map(s => [s.id, s.name]));
  const targets = users.filter(u => u.onboarded && ((u.pushTokens as string[]) || []).length > 0);

  for (const user of targets) {
    const school = user.schoolId ? schools.get(user.schoolId as string) : null;
    const where = school ? ` at ${school}` : '';
    await sendPush(db, user, 'round', `Today's round is live${where}. Go pick someone.`);
  }
}

/* The flame notification's text. Mirrors what the Inbox already reveals about a voter (gender and
   grade) and nothing more: an anonymous God Mode voter stays anonymous here too, and the voter's
   name never appears, because the notification can be read off a lock screen by anyone. */
export function flameBody(voter: User, pollText: string, anonymous: boolean): string {
  if (anonymous) return `Someone picked you for "${pollText}"`;
  const gender = String(voter.gender ?? '');
  const article =
    gender === 'girl' ? 'A girl' : gender === 'boy' ? 'A boy' : gender === 'nonbinary' ? 'Someone' : 'Someone';
  const grade = String(voter.grade ?? '');
  const gradeLabel = /^\d+$/.test(grade) ? ` in ${grade}th` : grade ? ` in ${grade}` : '';
  return `${article}${gradeLabel} picked you for "${pollText}"`;
}
