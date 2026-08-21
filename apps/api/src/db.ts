/* Neon over HTTP — the only mode that works on Cloudflare Workers (WebSocket/Pool, used by the
   root store.ts for the long-running Node server, fails outright here). Request-scoped, no
   connection state to manage between requests. Mirrors store.ts's schools/users query shapes. */
import { neon } from '@neondatabase/serverless';

/* The three id lists a friendship is made of, and the only keys addToIdList/removeFromIdList accept.

   A friendship is symmetric and approved, so it lives as three lists kept in sync across two rows:
   `friends` on both once accepted, `requestsIn` on the receiver and `requestsOut` on the sender while
   it's pending. Storing both directions rather than deriving one from the other is what lets "who has
   asked me" be a single indexed read instead of a scan of every user's outgoing list. */
export const FRIEND_LISTS = ['friends', 'requestsIn', 'requestsOut'] as const;
export type FriendList = (typeof FRIEND_LISTS)[number];

export type School = { id: string; name: string; city: string; createdAt: string };
export type User = { id: string; schoolId: string | null; clerkUserId?: string | null; [key: string]: unknown };
export type Poll = { id: string; emoji: string; text: string; color: string; enabled: boolean; schoolId: string | null; createdAt: string };
export type Vote = {
  id: string; voterId: string; targetId: string; questionId: string | null;
  emoji: string; text: string; color: string; unread: boolean; ts: string;
  voterName: string; targetName: string;
};
export type Report = {
  id: string; byUserId: string | null; targetId: string | null; reason: string; status: string; ts: string;
  byName: string; targetName: string;
};
export type AdminStats = { schools: number; users: number; polls: number; votes: number; infiniteAura: number; reports: number };
export type Boost = { id: string; byUserId: string; targetId: string | null; remaining: number; ts: string };
/** Raw vote row, no name resolution — auras.ts does the anonymous/name logic against this. */
export type RawVote = {
  id: string; voterId: string; targetId: string; questionId: string | null;
  emoji: string; text: string; color: string; unread: boolean; ts: string;
  /** Whether this card has been flipped. Per card, not per person. */
  nameRevealed: boolean;
  /** Whether this card has been opened at full size — see migrations.ts. Not the same as flipped. */
  opened: boolean;
};

function rowToSchool(row: any): School {
  return { id: row.id, name: row.name, city: row.city || '', createdAt: new Date(row.created_at).toISOString() };
}
function rowToUser(row: any): User {
  return { id: row.id, schoolId: row.school_id, clerkUserId: row.clerk_user_id ?? null, ...row.data };
}
/** Splits schoolId/clerkUserId (real columns) out of the rest (JSONB blob) — mirrors store.ts's splitUser. */
function splitUser(u: Partial<User>): { schoolId: string | null | undefined; clerkUserId: string | null | undefined; data: Record<string, unknown> } {
  const { id, schoolId, clerkUserId, ...data } = u;
  return { schoolId, clerkUserId, data };
}
function rowToPoll(row: any): Poll {
  return { id: row.id, emoji: row.emoji, text: row.text, color: row.color, enabled: row.enabled, schoolId: row.school_id, createdAt: new Date(row.created_at).toISOString() };
}
function fullName(first: string | null, last: string | null): string {
  return first || last ? `${first || ''} ${last || ''}`.trim() : '(deleted)';
}
function rowToVote(row: any): Vote {
  return {
    id: row.id, voterId: row.voter_id, targetId: row.target_id, questionId: row.question_id,
    emoji: row.emoji, text: row.text, color: row.color, unread: row.unread,
    ts: new Date(row.ts).toISOString(),
    voterName: fullName(row.voter_first, row.voter_last), targetName: fullName(row.target_first, row.target_last)
  };
}
function rowToReport(row: any): Report {
  return {
    id: row.id, byUserId: row.by_user_id, targetId: row.target_id, reason: row.reason, status: row.status,
    ts: new Date(row.ts).toISOString(),
    byName: fullName(row.by_first, row.by_last), targetName: fullName(row.target_first, row.target_last)
  };
}
function rowToBoost(row: any): Boost {
  return { id: row.id, byUserId: row.by_user_id, targetId: row.target_id, remaining: row.remaining, ts: new Date(row.ts).toISOString() };
}
function rowToRawVote(row: any): RawVote {
  return {
    id: row.id, voterId: row.voter_id, targetId: row.target_id, questionId: row.question_id,
    emoji: row.emoji, text: row.text, color: row.color, unread: row.unread,
    ts: new Date(row.ts).toISOString(),
    nameRevealed: !!row.name_revealed,
    opened: !!row.opened
  };
}

export function makeDb(databaseUrl: string) {
  const sql = neon(databaseUrl);

  return {
    async getSchoolsWithUserCounts(): Promise<(School & { userCount: number })[]> {
      const rows = await sql`
        SELECT s.id, s.name, s.city, s.created_at, COUNT(u.id)::int AS user_count
        FROM schools s LEFT JOIN users u ON u.school_id = s.id
        GROUP BY s.id ORDER BY s.created_at
      `;
      return rows.map((r: any) => ({ ...rowToSchool(r), userCount: r.user_count }));
    },

    async getSchool(id: string): Promise<School | null> {
      const rows = await sql`SELECT id, name, city, created_at FROM schools WHERE id = ${id}`;
      return rows.length ? rowToSchool(rows[0]) : null;
    },

    async createSchool(fields: { id: string; name: string; city?: string }): Promise<School> {
      const rows = await sql`
        INSERT INTO schools (id, name, city) VALUES (${fields.id}, ${fields.name}, ${fields.city || ''})
        RETURNING id, name, city, created_at
      `;
      return rowToSchool(rows[0]);
    },

    async updateSchool(id: string, fields: { name?: string; city?: string }): Promise<School | null> {
      const rows = await sql`
        UPDATE schools SET name = COALESCE(${fields.name ?? null}, name), city = COALESCE(${fields.city ?? null}, city)
        WHERE id = ${id} RETURNING id, name, city, created_at
      `;
      return rows.length ? rowToSchool(rows[0]) : null;
    },

    async deleteSchool(id: string): Promise<boolean> {
      const rows = await sql`DELETE FROM schools WHERE id = ${id} RETURNING id`;
      return rows.length > 0;
    },

    async getUserById(id: string): Promise<User | null> {
      const rows = await sql`SELECT id, school_id, data FROM users WHERE id = ${id}`;
      return rows.length ? rowToUser(rows[0]) : null;
    },

    /* ---------- polls ---------- */

    async getPolls(): Promise<Poll[]> {
      const rows = await sql`SELECT id, emoji, text, color, enabled, school_id, created_at FROM polls ORDER BY created_at`;
      return rows.map(rowToPoll);
    },

    async createPoll(fields: { id: string; emoji: string; text: string; color: string; schoolId?: string | null; enabled?: boolean }): Promise<Poll> {
      const rows = await sql`
        INSERT INTO polls (id, emoji, text, color, school_id, enabled)
        VALUES (${fields.id}, ${fields.emoji}, ${fields.text}, ${fields.color}, ${fields.schoolId ?? null}, ${fields.enabled ?? true})
        RETURNING id, emoji, text, color, enabled, school_id, created_at
      `;
      return rowToPoll(rows[0]);
    },

    async updatePoll(id: string, fields: { emoji?: string; text?: string; color?: string; enabled?: boolean; schoolId?: string | null }): Promise<Poll | null> {
      const rows = await sql`
        UPDATE polls SET
          emoji = COALESCE(${fields.emoji ?? null}, emoji),
          text = COALESCE(${fields.text ?? null}, text),
          color = COALESCE(${fields.color ?? null}, color),
          enabled = COALESCE(${fields.enabled ?? null}, enabled),
          school_id = CASE WHEN ${('schoolId' in fields) as boolean} THEN ${fields.schoolId ?? null} ELSE school_id END
        WHERE id = ${id}
        RETURNING id, emoji, text, color, enabled, school_id, created_at
      `;
      return rows.length ? rowToPoll(rows[0]) : null;
    },

    async deletePoll(id: string): Promise<boolean> {
      const rows = await sql`DELETE FROM polls WHERE id = ${id} RETURNING id`;
      return rows.length > 0;
    },

    /* ---------- votes (admin moderation) ---------- */

    async getVotes(limit = 300): Promise<Vote[]> {
      const rows = await sql`
        SELECT v.id, v.voter_id, v.target_id, v.question_id, v.emoji, v.text, v.color, v.unread, v.ts,
               voter.data->>'firstName' AS voter_first, voter.data->>'lastName' AS voter_last,
               target.data->>'firstName' AS target_first, target.data->>'lastName' AS target_last
        FROM votes v
        LEFT JOIN users voter ON voter.id = v.voter_id
        LEFT JOIN users target ON target.id = v.target_id
        ORDER BY v.ts DESC
        LIMIT ${limit}
      `;
      return rows.map(rowToVote);
    },

    async deleteVote(id: string): Promise<boolean> {
      const rows = await sql`DELETE FROM votes WHERE id = ${id} RETURNING id`;
      return rows.length > 0;
    },

    /* ---------- reports ---------- */

    async getReports(): Promise<Report[]> {
      const rows = await sql`
        SELECT r.id, r.by_user_id, r.target_id, r.reason, r.status, r.ts,
               byu.data->>'firstName' AS by_first, byu.data->>'lastName' AS by_last,
               tgt.data->>'firstName' AS target_first, tgt.data->>'lastName' AS target_last
        FROM reports r
        LEFT JOIN users byu ON byu.id = r.by_user_id
        LEFT JOIN users tgt ON tgt.id = r.target_id
        ORDER BY r.ts DESC
      `;
      return rows.map(rowToReport);
    },

    /* Reports *filed by* one user. Same shape as getReports, scoped by by_user_id — this is the
       reporter's own data, so it isn't admin-gated (see the myReports resolver). */
    async getReportsByUser(byUserId: string): Promise<Report[]> {
      const rows = await sql`
        SELECT r.id, r.by_user_id, r.target_id, r.reason, r.status, r.ts,
               byu.data->>'firstName' AS by_first, byu.data->>'lastName' AS by_last,
               tgt.data->>'firstName' AS target_first, tgt.data->>'lastName' AS target_last
        FROM reports r
        LEFT JOIN users byu ON byu.id = r.by_user_id
        LEFT JOIN users tgt ON tgt.id = r.target_id
        WHERE r.by_user_id = ${byUserId}
        ORDER BY r.ts DESC
      `;
      return rows.map(rowToReport);
    },

    async resolveReport(id: string): Promise<Report | null> {
      const rows = await sql`UPDATE reports SET status = 'resolved' WHERE id = ${id} RETURNING id`;
      if (!rows.length) return null;
      const full = await sql`
        SELECT r.id, r.by_user_id, r.target_id, r.reason, r.status, r.ts,
               byu.data->>'firstName' AS by_first, byu.data->>'lastName' AS by_last,
               tgt.data->>'firstName' AS target_first, tgt.data->>'lastName' AS target_last
        FROM reports r
        LEFT JOIN users byu ON byu.id = r.by_user_id
        LEFT JOIN users tgt ON tgt.id = r.target_id
        WHERE r.id = ${id}
      `;
      return rowToReport(full[0]);
    },

    /* ---------- admin stats ---------- */

    async getAdminStats(): Promise<AdminStats> {
      const [schools, users, polls, votes, infiniteAura, reports] = await Promise.all([
        sql`SELECT COUNT(*)::int AS n FROM schools`,
        sql`SELECT COUNT(*)::int AS n FROM users`,
        sql`SELECT COUNT(*)::int AS n FROM polls`,
        sql`SELECT COUNT(*)::int AS n FROM votes`,
        sql`SELECT COUNT(*)::int AS n FROM users WHERE (data->>'infiniteAura')::boolean`,
        sql`SELECT COUNT(*)::int AS n FROM reports WHERE status = 'open'`
      ]);
      return {
        schools: schools[0].n, users: users[0].n, polls: polls[0].n,
        votes: votes[0].n, infiniteAura: infiniteAura[0].n, reports: reports[0].n
      };
    },

    /* ---------- profile ---------- */

    /* Which prompts a person has been picked for, and how many times each — 13A's "what you've won"
       chips. Grouped in SQL by the poll's own emoji/text/colour rather than by question_id, because
       question_id is nullable (ON DELETE SET NULL) and a deleted poll would otherwise split into
       untitled buckets. */
    async getAuraCountsByPoll(
      targetId: string,
      sinceIso: string
    ): Promise<{ emoji: string; text: string; color: string; n: number }[]> {
      const rows = await sql`
        SELECT emoji, text, color, COUNT(*)::int AS n
        FROM votes
        WHERE target_id = ${targetId} AND ts >= ${sinceIso}
        GROUP BY emoji, text, color
        ORDER BY n DESC, text
      `;
      return rows.map((r: any) => ({ emoji: r.emoji, text: r.text, color: r.color, n: r.n }));
    },

    /** Case-insensitive handle lookup — usernames have no DB constraint, so uniqueness is enforced here. */
    async findByUsername(username: string): Promise<User | null> {
      const rows = await sql`
        SELECT id, school_id, clerk_user_id, data FROM users
        WHERE lower(data->>'username') = ${username.toLowerCase()}
        LIMIT 1
      `;
      return rows.length ? rowToUser(rows[0]) : null;
    },

    /* ---------- privacy / school size ---------- */

    /* How many people at a school share each (gender, grade) pair.

       This is the denominator for the anonymity floor in auras.ts: a aura that says "a girl in 11th
       grade picked you" is only anonymous if there are enough girls in 11th to hide in. Counted in SQL
       because it's a whole-school aggregate that would otherwise mean loading every roster row on
       every Inbox open. */
    async getCohortCounts(schoolId: string): Promise<{ gender: string | null; grade: string | null; n: number }[]> {
      const rows = await sql`
        SELECT data->>'gender' AS gender, data->>'grade' AS grade, COUNT(*)::int AS n
        FROM users
        WHERE school_id = ${schoolId}
        GROUP BY gender, grade
      `;
      return rows.map((r: any) => ({ gender: r.gender, grade: r.grade, n: r.n }));
    },

    async countSchoolUsers(schoolId: string): Promise<number> {
      const rows = await sql`SELECT COUNT(*)::int AS n FROM users WHERE school_id = ${schoolId}`;
      return rows[0]?.n ?? 0;
    },

    /* ---------- ranks board ---------- */

    /* Auras received per person at one school inside a time window, highest first.

       Deliberately counts *every* vote in the window with no viewer-relative filtering: 8A's
       "Blocked on the board" screen keeps rank and score truthful and masks only identity, so the
       blocked check belongs in the resolver, not here. Aggregating in SQL rather than in JS because
       this reads the whole school's vote history — the alternative is pulling every row per request.

       Ties break on target_id so the ordering is stable between requests; without it two people on
       the same score can swap places on a refresh and the board looks broken. */
    async getBoard(
      schoolId: string,
      sinceIso: string,
      grade?: string
    ): Promise<{ userId: string; firstName: string | null; lastName: string | null; grade: string | null; auras: number }[]> {
      const rows = grade
        ? await sql`
            SELECT v.target_id AS user_id, u.data->>'firstName' AS first, u.data->>'lastName' AS last,
                   u.data->>'grade' AS grade, COUNT(*)::int AS auras
            FROM votes v JOIN users u ON u.id = v.target_id
            WHERE u.school_id = ${schoolId} AND v.ts >= ${sinceIso} AND u.data->>'grade' = ${grade}
            GROUP BY v.target_id, first, last, grade
            ORDER BY auras DESC, v.target_id
          `
        : await sql`
            SELECT v.target_id AS user_id, u.data->>'firstName' AS first, u.data->>'lastName' AS last,
                   u.data->>'grade' AS grade, COUNT(*)::int AS auras
            FROM votes v JOIN users u ON u.id = v.target_id
            WHERE u.school_id = ${schoolId} AND v.ts >= ${sinceIso}
            GROUP BY v.target_id, first, last, grade
            ORDER BY auras DESC, v.target_id
          `;
      return rows.map((r: any) => ({
        userId: r.user_id,
        firstName: r.first,
        lastName: r.last,
        grade: r.grade,
        auras: r.auras
      }));
    },

    /* ---------- users: batch/scoped lookups, mutation, identity ---------- */

    /** Batch fetch — avoids N+1 queries (used by aurasFor/buildRound's voter/booster lookups). */
    async getUsersByIds(ids: string[]): Promise<User[]> {
      if (!ids.length) return [];
      const rows = await sql`SELECT id, school_id, clerk_user_id, data FROM users WHERE id = ANY(${ids})`;
      return rows.map(rowToUser);
    },

    /** schoolId may be null (unonboarded users) — IS NOT DISTINCT FROM handles that correctly, unlike `=`. */
    async getUsersBySchool(schoolId: string | null, excludeId: string): Promise<User[]> {
      const rows = await sql`
        SELECT id, school_id, clerk_user_id, data FROM users
        WHERE school_id IS NOT DISTINCT FROM ${schoolId} AND id IS DISTINCT FROM ${excludeId}
      `;
      return rows.map(rowToUser);
    },

    /** Admin listing — every user, optionally scoped to a school. Mirrors the old REST admin
        endpoint's `?schoolId=` filter. No pagination, matching that endpoint's own behavior. */
    async getAllUsers(schoolId?: string): Promise<User[]> {
      const rows = schoolId
        ? await sql`SELECT id, school_id, clerk_user_id, data FROM users WHERE school_id = ${schoolId}`
        : await sql`SELECT id, school_id, clerk_user_id, data FROM users`;
      return rows.map(rowToUser);
    },

    /** Lazy sync (no webhook in this phase — see plan): first authenticated request from a new
        Clerk identity creates the app-side row, same shape as server.js's self-signup path. */
    async getOrCreateUserByClerkId(clerkUserId: string, phone: string | null, newId: string): Promise<User> {
      const existing = await sql`SELECT id, school_id, clerk_user_id, data FROM users WHERE clerk_user_id = ${clerkUserId}`;
      if (existing.length) return rowToUser(existing[0]);
      const data = {
        firstName: '', lastName: '', username: '', gender: 'boy', grade: '', age: null,
        phone: phone || '', coins: 2, infiniteAura: false, friendIds: [], onboarded: false,
        createdAt: new Date().toISOString(), photo: null
      };
      const rows = await sql`
        INSERT INTO users (id, school_id, clerk_user_id, data)
        VALUES (${newId}, NULL, ${clerkUserId}, ${JSON.stringify(data)})
        RETURNING id, school_id, clerk_user_id, data
      `;
      return rowToUser(rows[0]);
    },

    /** Shallow-merges `fields` into the JSONB blob; schoolId/clerkUserId, if present, go to their real columns. */
    async updateUser(id: string, fields: Partial<User>): Promise<User | null> {
      const { schoolId, clerkUserId, data } = splitUser(fields);
      const hasSchoolId = 'schoolId' in fields;
      const hasClerkUserId = 'clerkUserId' in fields;
      const rows = await sql`
        UPDATE users SET
          school_id = CASE WHEN ${hasSchoolId} THEN ${schoolId ?? null} ELSE school_id END,
          clerk_user_id = CASE WHEN ${hasClerkUserId} THEN ${clerkUserId ?? null} ELSE clerk_user_id END,
          data = data || ${JSON.stringify(data)}::jsonb
        WHERE id = ${id}
        RETURNING id, school_id, clerk_user_id, data
      `;
      return rows.length ? rowToUser(rows[0]) : null;
    },

    /**
     * Atomically add `delta` coins (negative to spend). Fails closed: if the balance would go
     * negative, no row is updated and null is returned — callers use that to distinguish
     * "insufficient funds" from a real error, without a separate read-then-check race window.
     */
    async adjustCoins(id: string, delta: number): Promise<number | null> {
      const rows = await sql`
        UPDATE users SET data = jsonb_set(data, '{coins}', to_jsonb(((data->>'coins')::int + ${delta})))
        WHERE id = ${id} AND (data->>'coins')::int + ${delta} >= 0
        RETURNING (data->>'coins')::int AS coins
      `;
      return rows.length ? rows[0].coins : null;
    },

    /**
     * Deletes the user and, in one atomic transaction, strips their id out of every other user's
     * friendIds/blocked/revealedVoters — those are opaque JSONB arrays with no FK to cascade
     * automatically. votes/boosts cascade via real FKs (ON DELETE CASCADE) automatically.
     */
    async deleteUser(id: string): Promise<void> {
      await sql.transaction(tx => [
        /* All three friend lists have to be scrubbed here, or a deleted account leaves a dangling id
           in the rows of everyone connected to them — a friend nobody can unfriend, or a request
           nobody can accept or deny, since the person is gone. `following` and `friendIds` are the
           retired fields; still cleaned so old rows don't keep stale ids either. */
        tx`UPDATE users SET data = jsonb_set(data, '{friends}', COALESCE(data->'friends','[]'::jsonb) - ${id}) WHERE data->'friends' ? ${id}`,
        tx`UPDATE users SET data = jsonb_set(data, '{requestsIn}', COALESCE(data->'requestsIn','[]'::jsonb) - ${id}) WHERE data->'requestsIn' ? ${id}`,
        tx`UPDATE users SET data = jsonb_set(data, '{requestsOut}', COALESCE(data->'requestsOut','[]'::jsonb) - ${id}) WHERE data->'requestsOut' ? ${id}`,
        tx`UPDATE users SET data = jsonb_set(data, '{following}', COALESCE(data->'following','[]'::jsonb) - ${id}) WHERE data->'following' ? ${id}`,
        tx`UPDATE users SET data = jsonb_set(data, '{friendIds}', COALESCE(data->'friendIds','[]'::jsonb) - ${id}) WHERE data->'friendIds' ? ${id}`,
        tx`UPDATE users SET data = jsonb_set(data, '{blocked}', COALESCE(data->'blocked','[]'::jsonb) - ${id}) WHERE data->'blocked' ? ${id}`,
        tx`UPDATE users SET data = jsonb_set(data, '{revealedVoters}', COALESCE(data->'revealedVoters','[]'::jsonb) - ${id}) WHERE data->'revealedVoters' ? ${id}`,
        tx`DELETE FROM users WHERE id = ${id}`
      ]);
    },

    /* ---------- boosts ---------- */

    async createBoost(fields: { id: string; byUserId: string; targetId: string | null; remaining: number }): Promise<Boost> {
      const rows = await sql`
        INSERT INTO boosts (id, by_user_id, target_id, remaining)
        VALUES (${fields.id}, ${fields.byUserId}, ${fields.targetId}, ${fields.remaining})
        RETURNING id, by_user_id, target_id, remaining, ts
      `;
      return rowToBoost(rows[0]);
    },

    /** Candidates for buildRound's boost-insertion logic — remaining>0, not self, targeting this user or school-wide. */
    async getCandidateBoosts(userId: string): Promise<Boost[]> {
      const rows = await sql`
        SELECT id, by_user_id, target_id, remaining, ts FROM boosts
        WHERE remaining > 0 AND by_user_id != ${userId} AND (target_id = ${userId} OR target_id IS NULL)
      `;
      return rows.map(rowToBoost);
    },

    async decrementBoost(id: string): Promise<void> {
      await sql`UPDATE boosts SET remaining = remaining - 1 WHERE id = ${id} AND remaining > 0`;
    },

    /* `hasActiveBoostFor` lived here — /vote's old eligibility check ("is target boosted into me's
       polls?"). Its `remaining >= 0` matched spent boosts forever, and the vote resolver now checks
       the target against the round's own served choices instead, which is strictly tighter. */

    /* ---------- votes (student-facing: auras + voting) ---------- */

    async createVote(fields: { id: string; voterId: string; targetId: string; questionId: string; emoji: string; text: string; color: string }): Promise<void> {
      await sql`
        INSERT INTO votes (id, voter_id, target_id, question_id, emoji, text, color)
        VALUES (${fields.id}, ${fields.voterId}, ${fields.targetId}, ${fields.questionId}, ${fields.emoji}, ${fields.text}, ${fields.color})
      `;
    },

    /* Raw votes for a target, newest first — auras.ts resolves the anonymous/name logic against
       these. `sinceIso` is the aura-lifetime window: filtering here rather than in JS means the
       query stops scaling with a user's *lifetime* vote history (which only ever grows) and rides
       idx_votes_target_id instead. Rows older than the window stay in the table for admin/analytics. */
    async getRawVotesForTarget(targetId: string, sinceIso: string): Promise<RawVote[]> {
      const rows = await sql`
        SELECT id, voter_id, target_id, question_id, emoji, text, color, name_revealed, opened, unread, ts
        FROM votes WHERE target_id = ${targetId} AND ts >= ${sinceIso} ORDER BY ts DESC
      `;
      return rows.map(rowToRawVote);
    },

    /* The same read across several targets at once — the Activity feed's friend rows.
       One `= ANY` rather than a query per friend: a well-connected student has dozens, and the feed
       shows a single merged timeline anyway, so fanning out in SQL and taking the newest `limit` rows
       is both fewer round trips and less data than fetching each friend's full window to throw most
       of it away. `LIMIT` is safe to apply in the query precisely because the sort is global — every
       row competes on ts, so the newest N overall is what comes back.

       Same window and index as getRawVotesForTarget above. What a caller may *say* about these rows
       is much narrower than for your own — see friendActivityFor in auras.ts. */
    async getRawVotesForTargets(targetIds: string[], sinceIso: string, limit: number): Promise<RawVote[]> {
      if (!targetIds.length) return [];
      const rows = await sql`
        SELECT id, voter_id, target_id, question_id, emoji, text, color, name_revealed, opened, unread, ts
        FROM votes WHERE target_id = ANY(${targetIds}) AND ts >= ${sinceIso} ORDER BY ts DESC LIMIT ${limit}
      `;
      return rows.map(rowToRawVote);
    },

    /** Scoped by targetId so a user can only reveal/mark their own auras, mirroring server.js's `x.targetId===me.id` checks. */
    async getVoteForTarget(voteId: string, targetId: string): Promise<RawVote | null> {
      const rows = await sql`SELECT id, voter_id, target_id, question_id, emoji, text, color, name_revealed, opened, unread, ts FROM votes WHERE id = ${voteId} AND target_id = ${targetId}`;
      return rows.length ? rowToRawVote(rows[0]) : null;
    },

    /* `markVoteRevealed` and `markVoteGradeRevealed` lived here, opening the initial and grade scratch
       tiles. Both tiles are gone; the columns behind them stay in the table (see migrations.ts) but
       nothing reads or writes them any more. */

    /* The name tile — one card, never the sender's other cards. Returns whether this call is what
       opened it, so the caller only spends a flip when a flip was actually needed: re-tapping a card
       that's already open must not cost a second one. */
    async markVoteNameRevealed(voteId: string): Promise<boolean> {
      const rows = await sql`UPDATE votes SET name_revealed = true WHERE id = ${voteId} AND name_revealed = false RETURNING id`;
      return rows.length > 0;
    },

    /* Records that a card was opened at full size. Scoped by targetId so you can only mark your own,
       the same rule getVoteForTarget enforces — the id comes straight off a client request.

       Nothing is returned: unlike markVoteNameRevealed (whose "did I open it" answer decides whether a
       flip gets charged) this costs nothing and is idempotent, so the caller has no decision to make. */
    async markVoteOpened(voteId: string, targetId: string): Promise<void> {
      await sql`UPDATE votes SET opened = true WHERE id = ${voteId} AND target_id = ${targetId}`;
    },

    async markAllVotesReadForTarget(targetId: string): Promise<void> {
      await sql`UPDATE votes SET unread = false WHERE target_id = ${targetId}`;
    },

    /* ---------- dev tools (see devTools.ts — gated behind AURA_DEV_TOOLS, never on in production) ----------

       These three are separated from everything above by intent, not by table. Each one does something
       no product code path is allowed to do: write a vote's timestamp directly, un-reveal a name that
       was paid for, or delete someone's cards outright. They exist so a tester can reach states that
       otherwise take real days of waiting, and they are the reason the env gate in devTools.ts is not
       optional. Nothing outside that file may call them. */

    /* Like createVote, but the caller supplies `ts` and the flip/read flags.
       `createVote` deliberately can't: a real vote happens now, arrives unread and arrives face down,
       and letting a resolver choose otherwise would make the aura window and the flip economy
       forgeable. Seeding a believable Cards grid needs exactly those three things to vary. */
    async devInsertVote(fields: {
      id: string; voterId: string; targetId: string; questionId: string;
      emoji: string; text: string; color: string; ts: string; nameRevealed: boolean; unread: boolean;
    }): Promise<void> {
      await sql`
        INSERT INTO votes (id, voter_id, target_id, question_id, emoji, text, color, ts, name_revealed, unread)
        VALUES (
          ${fields.id}, ${fields.voterId}, ${fields.targetId}, ${fields.questionId},
          ${fields.emoji}, ${fields.text}, ${fields.color}, ${fields.ts}, ${fields.nameRevealed}, ${fields.unread}
        )
      `;
    },

    /* Puts every card back to untouched — face down, unread, and never opened.

       `opened` matters as much as `name_revealed` here, and missing it was a real hole. A protected
       sender's card can never be flipped, so `name_revealed` is false on it forever; a reset that
       only looked at that column skipped those rows entirely and left `opened` set. The card then
       came back from a "reset" already wearing the lavender you're only supposed to see after going
       to look — the one state the reset exists to let you reach again.

       Hence `OR` in the WHERE: either flag having been set is enough to make the row dirty. Returns
       how many rows were actually restored. */
    async devResetCardStateForTarget(targetId: string): Promise<number> {
      const rows = await sql`
        UPDATE votes SET name_revealed = false, opened = false, unread = true
        WHERE target_id = ${targetId} AND (name_revealed = true OR opened = true) RETURNING id
      `;
      return rows.length;
    },

    /** Deletes every card someone has received. Returns how many went. */
    async devDeleteVotesForTarget(targetId: string): Promise<number> {
      const rows = await sql`DELETE FROM votes WHERE target_id = ${targetId} RETURNING id`;
      return rows.length;
    },

    /* ---------- friend lists (atomic) ---------- */

    /* Add to / remove from one of the user's id lists in SQL, against the row as it is *now*.

       `updateUser` merges a whole array that the resolver computed from a row read at the start of its
       request. Two writes landing inside one round trip therefore each write their own copy of the
       list, and one of them is silently lost. Friend requests make that easy to reach — the People
       screen's rows are individually tappable and people rapid-fire down the list, and accepting a
       request touches *two* lists on each of two users — so these do the edit in the database instead
       of read-modify-write.

       Generic over the key because a friendship is three lists (`friends`, `requestsIn`, `requestsOut`)
       kept in sync across two rows, and five near-identical copies of this SQL is how they'd drift.
       The key is a literal from FRIEND_LISTS below, never caller input — jsonb_set's path is data, not
       an identifier, but keeping it to a fixed set means no query is ever assembled from a string.

       Lists are read as sets everywhere, so deduplicating here is free and a double-tap can't
       double-insert. The jsonb_typeof guard is for rows where the key is missing or holds a JSON null
       rather than an array; coalesce alone doesn't catch the latter. */
    async addToIdList(id: string, key: FriendList, addIds: string[]): Promise<string[]> {
      if (addIds.length === 0) return ((await this.getUserById(id))?.[key] as string[]) ?? [];
      const rows = await sql`
        UPDATE users SET data = jsonb_set(
          data, ARRAY[${key}],
          (SELECT coalesce(jsonb_agg(DISTINCT elem), '[]'::jsonb)
           FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(data->${key}) = 'array' THEN data->${key} ELSE '[]'::jsonb END
             || ${JSON.stringify(addIds)}::jsonb
           ) AS elem)
        )
        WHERE id = ${id}
        RETURNING data->${key} AS list
      `;
      return (rows[0]?.list as string[]) ?? [];
    },

    async removeFromIdList(id: string, key: FriendList, removeId: string): Promise<string[]> {
      const rows = await sql`
        UPDATE users SET data = jsonb_set(
          data, ARRAY[${key}],
          (SELECT coalesce(jsonb_agg(elem), '[]'::jsonb)
           FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(data->${key}) = 'array' THEN data->${key} ELSE '[]'::jsonb END
           ) AS elem
           WHERE elem <> to_jsonb(${removeId}::text))
        )
        WHERE id = ${id}
        RETURNING data->${key} AS list
      `;
      return (rows[0]?.list as string[]) ?? [];
    },

    /* Votes this person has cast since an instant — the out-of-rounds screen's "24 votes cast today",
       passed UTC midnight. Uses idx_votes_voter_id. */
    async countVotesByVoterSince(voterId: string, sinceIso: string): Promise<number> {
      const rows = await sql`SELECT COUNT(*)::int AS n FROM votes WHERE voter_id = ${voterId} AND ts >= ${sinceIso}`;
      return rows[0].n;
    },

    /* ---------- reports (user-submitted, in addition to Phase 2's admin view/resolve) ---------- */

    async createReport(fields: { id: string; byUserId: string; targetId: string | null; reason: string }): Promise<void> {
      await sql`INSERT INTO reports (id, by_user_id, target_id, reason) VALUES (${fields.id}, ${fields.byUserId}, ${fields.targetId}, ${fields.reason})`;
    }
  };
}
export type Db = ReturnType<typeof makeDb>;
