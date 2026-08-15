/* Neon over HTTP — the only mode that works on Cloudflare Workers (WebSocket/Pool, used by the
   root store.ts for the long-running Node server, fails outright here). Request-scoped, no
   connection state to manage between requests. Mirrors store.ts's schools/users query shapes. */
import { neon } from '@neondatabase/serverless';

export type School = { id: string; name: string; city: string; createdAt: string };
export type User = { id: string; schoolId: string | null; [key: string]: unknown };
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

function rowToSchool(row: any): School {
  return { id: row.id, name: row.name, city: row.city || '', createdAt: new Date(row.created_at).toISOString() };
}
function rowToUser(row: any): User {
  return { id: row.id, schoolId: row.school_id, ...row.data };
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
    }
  };
}
export type Db = ReturnType<typeof makeDb>;
