/* Schema DDL — single source of truth for scripts/migrate.ts (real databases) and
   test/helpers.ts's resetDb() (disposable Neon test branches). Idempotent (IF NOT EXISTS
   throughout) so it's safe to run against a database that already has some/all of this. */
import type { NeonQueryFunction } from '@neondatabase/serverless';
import { POLL_LIB } from './pollLibrary';

export async function runMigrations(sql: NeonQueryFunction<false, false>): Promise<void> {
  // Same shape store.ts (the frozen legacy backend) used — apps/api no longer assumes that ever ran.
  await sql`
    CREATE TABLE IF NOT EXISTS schools (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      city TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      school_id TEXT REFERENCES schools(id) ON DELETE SET NULL,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_users_school_id ON users(school_id)`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS clerk_user_id TEXT UNIQUE`;

  await sql`
    CREATE TABLE IF NOT EXISTS polls (
      id TEXT PRIMARY KEY,
      emoji TEXT NOT NULL, text TEXT NOT NULL, color TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT true,
      school_id TEXT REFERENCES schools(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_polls_school_id ON polls(school_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS votes (
      id TEXT PRIMARY KEY,
      voter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      question_id TEXT REFERENCES polls(id) ON DELETE SET NULL,
      emoji TEXT NOT NULL, text TEXT NOT NULL, color TEXT NOT NULL,
      unread BOOLEAN NOT NULL DEFAULT true,
      ts TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_votes_target_id ON votes(target_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_votes_voter_id ON votes(voter_id)`;
  /* Dropping the clue ladder's two columns.

     `revealed` (the first-initial tile) and `grade_revealed` (the grade tile) backed a feature that no
     longer exists: a card is face down or flipped, and `name_revealed` below is the only thing that
     says which. Nothing has read or written either since the ladder was removed.

     **This destroys data and cannot be undone.** What is lost is which scratch tiles each person had
     bought — of no value now that tiles can't be bought, and misleading to keep as a column the schema
     implies is live. Take a snapshot before running this against production if that history matters to
     you. `IF EXISTS` so re-running is a no-op, and this sits after the CREATE above because
     `CREATE TABLE IF NOT EXISTS` never alters a table that already exists. */
  await sql`ALTER TABLE votes DROP COLUMN IF EXISTS revealed`;
  await sql`ALTER TABLE votes DROP COLUMN IF EXISTS grade_revealed`;
  /* The name tile, moved from the person to the card.

     It used to live on the *user* as `revealedVoters` — a list of people whose name you'd bought. That
     made a flip buy every card that person had ever sent you: five picks from one classmate opened all
     five at once, which is both the wrong price and the wrong story ("five people noticed you" collapsing
     into one on a single tap). Per-vote, a flip opens exactly the card you flipped.

     `revealedVoters` is no longer read. Old rows keep the field harmlessly, and nothing migrates out of
     it: back-filling would silently hand out flips nobody spent under the new rule. */
  await sql`ALTER TABLE votes ADD COLUMN IF NOT EXISTS name_revealed BOOLEAN NOT NULL DEFAULT false`;

  /* Whether the card has been opened at full size, which is not the same as flipped.

     Two cards can be permanently un-flippable — a sender with Infinite Aura, and one you ran out of
     flips on — and until now nothing on either recorded that you'd already been to look. You'd tap
     the same protected card three times a week because the grid had no way to say "you've seen this,
     it isn't going to change".

     `unread` can't carry this: the Inbox clears every card's unread flag in bulk the moment the tab
     mounts (markAurasRead), so it means "has the grid been opened", not "has this card been opened".
     A separate column is what makes it per-card.

     Server-side rather than device-local so it survives a reinstall and follows the account across
     devices — the same reason `name_revealed` lives here. Defaults false, so every existing card
     starts unopened, which is the honest answer for rows written before anything tracked it. */
  await sql`ALTER TABLE votes ADD COLUMN IF NOT EXISTS opened BOOLEAN NOT NULL DEFAULT false`;

  await sql`
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      target_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      reason TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',
      ts TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status)`;

  await sql`
    CREATE TABLE IF NOT EXISTS boosts (
      id TEXT PRIMARY KEY,
      by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      remaining INT NOT NULL,
      ts TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_boosts_by_user_id ON boosts(by_user_id)`;

  /* Admin-set overrides for the dials in tuning.ts, one row per overridden dial. Absence means "use
     the default (or the env var)" — the table is not a copy of every dial, only the deliberate edits,
     which is what lets "clear override" mean something. INT because every dial is an integer
     (resolveTuning floors); the write path validates before insert, same rules as the env path. */
  await sql`
    CREATE TABLE IF NOT EXISTS tuning_overrides (
      key TEXT PRIMARY KEY,
      value INT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await renameLegacyUserKeys(sql);
  await migrateFollowsToFriends(sql);
}

/* The pre-Aura vocabulary, renamed inside users.data.

   ## Do not "tidy" the legacy strings below

   This function is the one place in the codebase that must still *say* the old words, because its job
   is to find rows written under them. A global search-and-replace across the repo will happily rewrite
   the quoted keys here into the new names, at which point the statement strips and re-adds the same
   three keys and migrates nothing — silently, with no error and a green typecheck. That already
   happened once during the rename this function exists to support. LEGACY_KEYS is spelled out as a
   named constant partly so it reads as data rather than as a typo waiting to be corrected.

   ## Why it matters

   These three are the only part of the Flame/Aura and God Mode/Infinite Aura rename that the compiler
   cannot check. `User` is `{ [key: string]: unknown }` (see db.ts), so a key that never gets migrated
   doesn't fail a typecheck — it reads back `undefined` at runtime, which is indistinguishable from a
   user who simply never had the value:

     godMode        -> infiniteAura          a paid membership silently reading as "not a member"
     godModeExpires -> infiniteAuraExpires   an expiry silently reading as "never expires"
     notifyFlames   -> notifyAuras           a push preference silently reverting to its default

   The first is the one that hurts: `godMode` is what marks somebody who has *paid*, so leaving it
   behind revokes Infinite Aura for every existing member at once.

   ## Shape

   One statement rather than three, and rebuilt with `-` then `||` rather than three `jsonb_set` calls:
   jsonb_set on a missing path is a no-op that silently leaves the old key in place, which is exactly
   the failure mode this is guarding against. Stripping the old keys and re-adding their values under
   the new names makes "the old key survived" impossible rather than merely unlikely.

   Idempotent via the WHERE: once renamed, no row carries any of the three, so a second run matches
   nothing. The CASE arms stop a row gaining a key it never had — without them a user with no
   `godModeExpires` comes out with `infiniteAuraExpires: null`, which is a different thing from absent
   everywhere else in this codebase. */
const LEGACY_KEYS = {
  infiniteAura: 'god' + 'Mode',
  infiniteAuraExpires: 'god' + 'ModeExpires',
  notifyAuras: 'notify' + 'Flames'
} as const;

async function renameLegacyUserKeys(sql: NeonQueryFunction<false, false>): Promise<void> {
  const { infiniteAura, infiniteAuraExpires, notifyAuras } = LEGACY_KEYS;
  await sql`
    UPDATE users SET data = (data - ${infiniteAura} - ${infiniteAuraExpires} - ${notifyAuras})
      || CASE WHEN data ? ${infiniteAura}
              THEN jsonb_build_object('infiniteAura', data->${infiniteAura}) ELSE '{}'::jsonb END
      || CASE WHEN data ? ${infiniteAuraExpires}
              THEN jsonb_build_object('infiniteAuraExpires', data->${infiniteAuraExpires}) ELSE '{}'::jsonb END
      || CASE WHEN data ? ${notifyAuras}
              THEN jsonb_build_object('notifyAuras', data->${notifyAuras}) ELSE '{}'::jsonb END
    WHERE data ?| array[${infiniteAura}, ${infiniteAuraExpires}, ${notifyAuras}]
  `;
}

/* Turns the retired one-directional `following` graph into mutual friendships.

   Following needed no approval and pointed one way. Friendship is symmetric and approved, so there is
   no lossless mapping — every existing edge has to become either a friendship or a pending request,
   and which one it becomes is a judgement about what people meant:

     A follows B and B follows A  ->  friends. Both already chose each other; making them re-ask would
                                      be asking a question they have both answered.
     A follows B only             ->  a pending request from A. A opted in, B never did, and a request
                                      is exactly "A wants this and B hasn't said yet".

   Nobody loses a connection and nobody is auto-friended with someone who never agreed.

   Idempotent, which is what lets it live in runMigrations rather than in a one-shot script: it skips
   any row that already has a `friends` key, so a second run is a no-op and a user who has since made
   real friends is never rewritten from their stale follow list. `following` is left in place — nothing
   reads it any more, and keeping it means this can be re-derived if the mapping above turns out wrong.

   Runs in one statement rather than a read-modify-write loop over every user: the whole point is that
   two rows have to agree about each edge, and doing that a row at a time in application code is how
   half-migrated graphs happen. */
async function migrateFollowsToFriends(sql: NeonQueryFunction<false, false>): Promise<void> {
  await sql`
    WITH edges AS (
      SELECT u.id AS follower, f.value #>> '{}' AS followee
      FROM users u
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(u.data->'following') = 'array' THEN u.data->'following' ELSE '[]'::jsonb END
      ) AS f(value)
      WHERE NOT (u.data ? 'friends')
    ),
    mutual AS (
      SELECT e.follower, e.followee FROM edges e
      WHERE EXISTS (SELECT 1 FROM edges b WHERE b.follower = e.followee AND b.followee = e.follower)
    ),
    oneway AS (
      SELECT e.follower, e.followee FROM edges e
      WHERE NOT EXISTS (SELECT 1 FROM edges b WHERE b.follower = e.followee AND b.followee = e.follower)
    ),
    lists AS (
      SELECT u.id,
        COALESCE((SELECT jsonb_agg(DISTINCT to_jsonb(m.followee)) FROM mutual m WHERE m.follower = u.id), '[]'::jsonb) AS friends,
        COALESCE((SELECT jsonb_agg(DISTINCT to_jsonb(o.follower)) FROM oneway o WHERE o.followee = u.id), '[]'::jsonb) AS requests_in,
        COALESCE((SELECT jsonb_agg(DISTINCT to_jsonb(o.followee)) FROM oneway o WHERE o.follower = u.id), '[]'::jsonb) AS requests_out
      FROM users u
      WHERE NOT (u.data ? 'friends')
    )
    UPDATE users u SET data = u.data
      || jsonb_build_object('friends', l.friends)
      || jsonb_build_object('requestsIn', l.requests_in)
      || jsonb_build_object('requestsOut', l.requests_out)
    FROM lists l WHERE l.id = u.id
  `;
}

/* Puts the curated prompts in as *global* polls, so a school works the day it's created.

   Why this is needed at all: `buildRound` only offers polls where `school_id IS NULL` (global) or match
   the user's school. With neither, it builds a round with zero questions — and a school with no
   questions has no votes, so no aura, so an empty board. That was the live state of Lincoln High with
   17 real users on it: the app looked broken and was, in the one way nothing else could compensate for.

   **Deliberately not called by runMigrations.** resetDb() re-runs the migrations between test files, so
   seeding there would silently hand every test 16 extra global polls — and auras.test.ts reasons
   explicitly about a controlled poll set against the 12-per-round cap. Tests stay hermetic; real
   databases get this from the migrate script or the admin mutation.

   Seeds only when no global poll exists, so it's safe to re-run and won't fight an admin who has curated
   their own set. The tradeoff: an admin who deletes every global poll gets the defaults back on the next
   migrate. That's the better failure — an app with zero polls is broken, and coming back is recoverable
   where staying empty isn't. */
export async function seedDefaultPolls(sql: NeonQueryFunction<false, false>): Promise<number> {
  const existing = await sql`SELECT 1 FROM polls WHERE school_id IS NULL LIMIT 1`;
  if (existing.length > 0) return 0;

  let seeded = 0;
  for (const [emoji, text, color] of POLL_LIB) {
    const id = 'poll_' + crypto.randomUUID().slice(0, 12);
    await sql`
      INSERT INTO polls (id, emoji, text, color, enabled, school_id)
      VALUES (${id}, ${emoji}, ${text}, ${color}, true, NULL)
    `;
    seeded++;
  }
  return seeded;
}
