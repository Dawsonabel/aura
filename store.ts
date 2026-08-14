/* ===== Aura — Neon Postgres persistence layer =====
   Two storage patterns live here side by side:

   1. `kv(coll,id,data)` — a generic document table for polls, votes, boosts,
      reports, sessions, rounds, and meta. server.js loads/persists these as
      one in-memory snapshot on a debounced timer, same as before.

   2. Real relational tables for `schools` and `users` — a genuine foreign
      key (`users.school_id REFERENCES schools(id) ON DELETE SET NULL`) and
      an index, queried directly per request. No in-memory snapshot for
      these two; every lookup is a real round trip. User rows are `(id,
      school_id, data)` — school_id is a real column for the FK/index/query,
      everything else (firstName, coins, friendIds, ...) stays in `data`
      JSONB, merged shallowly on update. Schools are small enough to be
      fully columned (id, name, city).
*/
import { Pool, type PoolClient } from '@neondatabase/serverless';

const ARRAY_COLLS = ['polls', 'votes', 'boosts', 'reports'] as const;
const MAP_COLLS = ['sessions', 'rounds'] as const;
type ArrayColl = (typeof ARRAY_COLLS)[number];
type MapColl = (typeof MAP_COLLS)[number];

export type Db = {
  [K in ArrayColl]: any[];
} & {
  [K in MapColl]: Record<string, any>;
} & {
  meta: Record<string, any>;
};

export type School = { id: string; name: string; city: string; createdAt: string };
// Loosely typed on purpose — this mirrors a plain-JS object with evolving fields
// (friendIds, blocked, revealedVoters, notifications, iapTransactions, ...).
export type User = { id: string; schoolId: string | null; [key: string]: any };

function rowToSchool(row: { id: string; name: string; city: string | null; created_at: any }): School {
  return { id: row.id, name: row.name, city: row.city || '', createdAt: new Date(row.created_at).toISOString() };
}
function rowToUser(row: { id: string; school_id: string | null; data: any }): User {
  return { id: row.id, schoolId: row.school_id, ...row.data };
}
/** Split a flat user object (as server.js builds it) into the real column + JSONB payload. */
function splitUser(u: Partial<User>): { schoolId: string | null | undefined; data: Record<string, any> } {
  const { id, schoolId, ...data } = u;
  return { schoolId, data };
}

export class Store {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  /** Create all tables if they don't exist yet. Call once before any other method. */
  async init(): Promise<void> {
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS kv (
         coll TEXT NOT NULL,
         id   TEXT NOT NULL,
         data JSONB NOT NULL,
         PRIMARY KEY (coll, id)
       )`
    );
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS schools (
         id TEXT PRIMARY KEY,
         name TEXT NOT NULL,
         city TEXT,
         created_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`
    );
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS users (
         id TEXT PRIMARY KEY,
         school_id TEXT REFERENCES schools(id) ON DELETE SET NULL,
         data JSONB NOT NULL,
         created_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`
    );
    await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_users_school_id ON users(school_id)`);
  }

  async isEmpty(): Promise<boolean> {
    const { rows } = await this.pool.query('SELECT COUNT(*)::int AS n FROM kv');
    return rows[0].n === 0;
  }

  /** Fresh-boot signal for seed() — schools/users live outside `kv`, so isEmpty() alone can't tell. */
  async schoolsCount(): Promise<number> {
    const { rows } = await this.pool.query('SELECT COUNT(*)::int AS n FROM schools');
    return rows[0].n;
  }

  /** Reconstruct the in-memory db shape ({polls:[], votes:[], sessions:{}, ...}) — schools/users excluded. */
  async loadInto(): Promise<Db> {
    const out: any = {};
    for (const c of ARRAY_COLLS) out[c] = [];
    for (const c of MAP_COLLS) out[c] = {};
    out.meta = {};
    const { rows } = await this.pool.query('SELECT coll, id, data FROM kv');
    for (const r of rows as { coll: string; id: string; data: any }[]) {
      if (r.coll === 'meta') out.meta = r.data;
      else if ((MAP_COLLS as readonly string[]).includes(r.coll)) out[r.coll][r.id] = r.data;
      else if ((ARRAY_COLLS as readonly string[]).includes(r.coll)) out[r.coll].push(r.data);
    }
    return out as Db;
  }

  /** Persist the whole in-memory db atomically (replace-in-transaction), one round trip per write. */
  async persist(db: Db): Promise<void> {
    const colls: string[] = [];
    const ids: string[] = [];
    const datas: string[] = [];
    const push = (coll: string, id: string, value: any) => {
      colls.push(coll);
      ids.push(id);
      datas.push(JSON.stringify(value));
    };
    for (const c of ARRAY_COLLS) {
      for (const item of db[c] || []) {
        if (item && item.id != null) push(c, String(item.id), item);
      }
    }
    for (const c of MAP_COLLS) {
      for (const key of Object.keys(db[c] || {})) push(c, key, db[c][key]);
    }
    push('meta', 'meta', db.meta || {});

    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM kv');
      if (colls.length > 0) {
        await client.query(
          `INSERT INTO kv (coll, id, data)
           SELECT * FROM unnest($1::text[], $2::text[], $3::jsonb[])`,
          [colls, ids, datas]
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  /* ---------- schools ---------- */

  async getSchools(): Promise<School[]> {
    const { rows } = await this.pool.query('SELECT id, name, city, created_at FROM schools ORDER BY created_at');
    return rows.map(rowToSchool);
  }

  /** Same as getSchools(), plus a userCount per school (0 for schools with no students). */
  async getSchoolsWithUserCounts(): Promise<(School & { userCount: number })[]> {
    const { rows } = await this.pool.query(
      `SELECT s.id, s.name, s.city, s.created_at, COUNT(u.id)::int AS user_count
       FROM schools s LEFT JOIN users u ON u.school_id = s.id
       GROUP BY s.id ORDER BY s.created_at`
    );
    return rows.map(r => ({ ...rowToSchool(r), userCount: r.user_count }));
  }

  async createSchool(s: { id: string; name: string; city?: string }): Promise<School> {
    const { rows } = await this.pool.query(
      'INSERT INTO schools (id, name, city) VALUES ($1,$2,$3) RETURNING id, name, city, created_at',
      [s.id, s.name, s.city || '']
    );
    return rowToSchool(rows[0]);
  }

  async updateSchool(id: string, fields: { name?: string; city?: string }): Promise<School | null> {
    const { rows } = await this.pool.query(
      `UPDATE schools SET name = COALESCE($2,name), city = COALESCE($3,city) WHERE id=$1
       RETURNING id, name, city, created_at`,
      [id, fields.name ?? null, fields.city ?? null]
    );
    return rows.length ? rowToSchool(rows[0]) : null;
  }

  /** ON DELETE SET NULL on users.school_id handles the cascade — no manual cleanup needed. */
  async deleteSchool(id: string): Promise<void> {
    await this.pool.query('DELETE FROM schools WHERE id=$1', [id]);
  }

  /* ---------- users ---------- */

  async getUserById(id: string): Promise<User | null> {
    const { rows } = await this.pool.query('SELECT id, school_id, data FROM users WHERE id=$1', [id]);
    return rows.length ? rowToUser(rows[0]) : null;
  }

  /** Batch fetch — use this instead of looping getUserById() to avoid N+1 queries. */
  async getUsersByIds(ids: string[]): Promise<User[]> {
    if (!ids.length) return [];
    const { rows } = await this.pool.query('SELECT id, school_id, data FROM users WHERE id = ANY($1::text[])', [ids]);
    return rows.map(rowToUser);
  }

  /** schoolId may be null (unonboarded users) — IS NOT DISTINCT FROM handles that correctly, unlike `=`. */
  async getUsersBySchool(schoolId: string | null, excludeId?: string): Promise<User[]> {
    const { rows } = await this.pool.query(
      'SELECT id, school_id, data FROM users WHERE school_id IS NOT DISTINCT FROM $1 AND id IS DISTINCT FROM $2',
      [schoolId, excludeId ?? null]
    );
    return rows.map(rowToUser);
  }

  /** Phone numbers aren't stored normalized — match the same way normPhone() in server.js does. */
  async getUserByPhone(digits: string): Promise<User | null> {
    const { rows } = await this.pool.query(
      `SELECT id, school_id, data FROM users WHERE regexp_replace(data->>'phone', '\\D', '', 'g') = $1 LIMIT 1`,
      [digits]
    );
    return rows.length ? rowToUser(rows[0]) : null;
  }

  /** Used by the dev-only /api/auth/demo endpoint: prefer an onboarded user with a school, else any user. */
  async getDemoUser(): Promise<User | null> {
    let { rows } = await this.pool.query(
      `SELECT id, school_id, data FROM users WHERE (data->>'onboarded')::boolean AND school_id IS NOT NULL ORDER BY created_at LIMIT 1`
    );
    if (!rows.length) {
      ({ rows } = await this.pool.query('SELECT id, school_id, data FROM users ORDER BY created_at LIMIT 1'));
    }
    return rows.length ? rowToUser(rows[0]) : null;
  }

  async getAllUsers(schoolIdFilter?: string): Promise<User[]> {
    const { rows } = schoolIdFilter
      ? await this.pool.query('SELECT id, school_id, data FROM users WHERE school_id=$1', [schoolIdFilter])
      : await this.pool.query('SELECT id, school_id, data FROM users');
    return rows.map(rowToUser);
  }

  async createUser(u: User): Promise<User> {
    const { schoolId, data } = splitUser(u);
    const { rows } = await this.pool.query(
      'INSERT INTO users (id, school_id, data) VALUES ($1,$2,$3) RETURNING id, school_id, data',
      [u.id, schoolId ?? null, JSON.stringify(data)]
    );
    return rowToUser(rows[0]);
  }

  /** Shallow-merges `fields` into the JSONB blob; `schoolId`, if present, goes to the real column instead. */
  async updateUser(id: string, fields: Partial<User>): Promise<User | null> {
    const { schoolId, data } = splitUser(fields);
    const hasSchoolId = 'schoolId' in fields;
    const { rows } = await this.pool.query(
      `UPDATE users SET
         school_id = CASE WHEN $3 THEN $2 ELSE school_id END,
         data = data || $4::jsonb
       WHERE id=$1
       RETURNING id, school_id, data`,
      [id, schoolId ?? null, hasSchoolId, JSON.stringify(data)]
    );
    return rows.length ? rowToUser(rows[0]) : null;
  }

  /**
   * Atomically add `delta` coins (negative to spend). Fails closed: if the
   * balance would go negative, no row is updated and null is returned —
   * callers use that to distinguish "insufficient funds" from a real error,
   * without a separate read-then-check race window.
   */
  async adjustCoins(id: string, delta: number): Promise<number | null> {
    const { rows } = await this.pool.query(
      `UPDATE users SET data = jsonb_set(data, '{coins}', to_jsonb(((data->>'coins')::int + $2)))
       WHERE id=$1 AND (data->>'coins')::int + $2 >= 0
       RETURNING (data->>'coins')::int AS coins`,
      [id, delta]
    );
    return rows.length ? rows[0].coins : null;
  }

  async countUsers(): Promise<number> {
    const { rows } = await this.pool.query('SELECT COUNT(*)::int AS n FROM users');
    return rows[0].n;
  }

  async countGodModeUsers(): Promise<number> {
    const { rows } = await this.pool.query(`SELECT COUNT(*)::int AS n FROM users WHERE (data->>'godMode')::boolean`);
    return rows[0].n;
  }

  /**
   * Deletes the user and, in the same transaction, strips their id out of every
   * other user's friendIds/blocked/revealedVoters — those are opaque JSONB
   * arrays with no FK to cascade automatically. Caller is still responsible for
   * cleaning up votes/boosts/sessions, which live in the kv table.
   */
  async deleteUser(id: string): Promise<void> {
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const field of ['friendIds', 'blocked', 'revealedVoters']) {
        await client.query(
          `UPDATE users SET data = jsonb_set(data, $1::text[], COALESCE(data->$2,'[]'::jsonb) - $3)
           WHERE data->$2 ? $3`,
          [`{${field}}`, field, id]
        );
      }
      await client.query('DELETE FROM users WHERE id=$1', [id]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
