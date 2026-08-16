/* Neon over HTTP — the only mode that works on Cloudflare Workers (WebSocket/Pool, used by the
   root store.ts for the long-running Node server, fails outright here). Request-scoped, no
   connection state to manage between requests. Mirrors store.ts's schools/users query shapes. */
import { neon } from '@neondatabase/serverless';

export type School = { id: string; name: string; city: string; createdAt: string };
export type User = { id: string; schoolId: string | null; clerkUserId?: string | null; [key: string]: unknown };
export type Poll = { id: string; emoji: string; text: string; color: string; enabled: boolean; schoolId: string | null; createdAt: string };
export type Vote = {
  id: string; voterId: string; targetId: string; questionId: string | null;
  emoji: string; text: string; color: string; revealed: boolean; unread: boolean; ts: string;
  voterName: string; targetName: string;
};
export type Report = {
  id: string; byUserId: string | null; targetId: string | null; reason: string; status: string; ts: string;
  byName: string; targetName: string;
};
export type AdminStats = { schools: number; users: number; polls: number; votes: number; godMode: number; reports: number };
export type Boost = { id: string; byUserId: string; targetId: string | null; remaining: number; ts: string };
/** Raw vote row, no name resolution — flames.ts does the anonymous/hint/name logic against this. */
export type RawVote = {
  id: string; voterId: string; targetId: string; questionId: string | null;
  emoji: string; text: string; color: string; revealed: boolean; unread: boolean; ts: string;
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
    emoji: row.emoji, text: row.text, color: row.color, revealed: row.revealed, unread: row.unread,
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
    emoji: row.emoji, text: row.text, color: row.color, revealed: row.revealed, unread: row.unread,
    ts: new Date(row.ts).toISOString()
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
        SELECT v.id, v.voter_id, v.target_id, v.question_id, v.emoji, v.text, v.color, v.revealed, v.unread, v.ts,
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
      const [schools, users, polls, votes, godMode, reports] = await Promise.all([
        sql`SELECT COUNT(*)::int AS n FROM schools`,
        sql`SELECT COUNT(*)::int AS n FROM users`,
        sql`SELECT COUNT(*)::int AS n FROM polls`,
        sql`SELECT COUNT(*)::int AS n FROM votes`,
        sql`SELECT COUNT(*)::int AS n FROM users WHERE (data->>'godMode')::boolean`,
        sql`SELECT COUNT(*)::int AS n FROM reports WHERE status = 'open'`
      ]);
      return {
        schools: schools[0].n, users: users[0].n, polls: polls[0].n,
        votes: votes[0].n, godMode: godMode[0].n, reports: reports[0].n
      };
    },

    /* ---------- users: batch/scoped lookups, mutation, identity ---------- */

    /** Batch fetch — avoids N+1 queries (used by flamesFor/buildRound's voter/booster lookups). */
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

    async getUserByClerkId(clerkUserId: string): Promise<User | null> {
      const rows = await sql`SELECT id, school_id, clerk_user_id, data FROM users WHERE clerk_user_id = ${clerkUserId}`;
      return rows.length ? rowToUser(rows[0]) : null;
    },

    /** Lazy sync (no webhook in this phase — see plan): first authenticated request from a new
        Clerk identity creates the app-side row, same shape as server.js's self-signup path. */
    async getOrCreateUserByClerkId(clerkUserId: string, phone: string | null, newId: string): Promise<User> {
      const existing = await sql`SELECT id, school_id, clerk_user_id, data FROM users WHERE clerk_user_id = ${clerkUserId}`;
      if (existing.length) return rowToUser(existing[0]);
      const data = {
        firstName: '', lastName: '', username: '', gender: 'boy', grade: '', age: null,
        phone: phone || '', coins: 2, godMode: false, friendIds: [], onboarded: false,
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

    /** Used by /vote's eligibility check: is target boosted into me's polls? */
    async hasActiveBoostFor(byUserId: string, viewerId: string): Promise<boolean> {
      const rows = await sql`
        SELECT 1 FROM boosts WHERE by_user_id = ${byUserId} AND remaining >= 0 AND (target_id = ${viewerId} OR target_id IS NULL) LIMIT 1
      `;
      return rows.length > 0;
    },

    /* ---------- votes (student-facing: flames + voting) ---------- */

    async createVote(fields: { id: string; voterId: string; targetId: string; questionId: string; emoji: string; text: string; color: string }): Promise<void> {
      await sql`
        INSERT INTO votes (id, voter_id, target_id, question_id, emoji, text, color)
        VALUES (${fields.id}, ${fields.voterId}, ${fields.targetId}, ${fields.questionId}, ${fields.emoji}, ${fields.text}, ${fields.color})
      `;
    },

    /** Raw votes for a target, newest first — flames.ts resolves the anonymous/hint/name logic against these. */
    async getRawVotesForTarget(targetId: string): Promise<RawVote[]> {
      const rows = await sql`SELECT id, voter_id, target_id, question_id, emoji, text, color, revealed, unread, ts FROM votes WHERE target_id = ${targetId} ORDER BY ts DESC`;
      return rows.map(rowToRawVote);
    },

    /** Scoped by targetId so a user can only reveal/mark their own flames, mirroring server.js's `x.targetId===me.id` checks. */
    async getVoteForTarget(voteId: string, targetId: string): Promise<RawVote | null> {
      const rows = await sql`SELECT id, voter_id, target_id, question_id, emoji, text, color, revealed, unread, ts FROM votes WHERE id = ${voteId} AND target_id = ${targetId}`;
      return rows.length ? rowToRawVote(rows[0]) : null;
    },

    async markVoteRevealed(voteId: string): Promise<void> {
      await sql`UPDATE votes SET revealed = true WHERE id = ${voteId}`;
    },

    async markAllVotesReadForTarget(targetId: string): Promise<void> {
      await sql`UPDATE votes SET unread = false WHERE target_id = ${targetId}`;
    },

    async countVotesFromVoterToTarget(voterId: string, targetId: string): Promise<number> {
      const rows = await sql`SELECT COUNT(*)::int AS n FROM votes WHERE voter_id = ${voterId} AND target_id = ${targetId}`;
      return rows[0].n;
    },

    /* ---------- reports (user-submitted, in addition to Phase 2's admin view/resolve) ---------- */

    async createReport(fields: { id: string; byUserId: string; targetId: string | null; reason: string }): Promise<void> {
      await sql`INSERT INTO reports (id, by_user_id, target_id, reason) VALUES (${fields.id}, ${fields.byUserId}, ${fields.targetId}, ${fields.reason})`;
    }
  };
}
export type Db = ReturnType<typeof makeDb>;
