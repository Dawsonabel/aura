/* Neon over HTTP — the only mode that works on Cloudflare Workers (WebSocket/Pool, used by the
   root store.ts for the long-running Node server, fails outright here). Request-scoped, no
   connection state to manage between requests. Mirrors store.ts's schools/users query shapes. */
import { neon } from '@neondatabase/serverless';

export type School = { id: string; name: string; city: string; createdAt: string };
export type User = { id: string; schoolId: string | null; [key: string]: unknown };

function rowToSchool(row: any): School {
  return { id: row.id, name: row.name, city: row.city || '', createdAt: new Date(row.created_at).toISOString() };
}
function rowToUser(row: any): User {
  return { id: row.id, schoolId: row.school_id, ...row.data };
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
    }
  };
}
export type Db = ReturnType<typeof makeDb>;
