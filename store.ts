/* ===== Aura — Neon Postgres persistence layer =====
   Drop-in replacement for the previous node:sqlite Store: same kv-document
   shape (coll, id, data), same in-memory `db` object it loads into/persists
   from. server.js's route handlers are untouched — they still just read and
   mutate the in-memory object synchronously; only load()/save() had to
   become async, since a network database can't be touched synchronously.

   Collections stored as documents in a single kv(coll,id,data) table:
     arrays  : schools, users, polls, votes, boosts, reports
     maps    : sessions, rounds        (keyed by their object key)
     single  : meta
   Ephemeral data (SMS codes) stays in memory and is intentionally NOT persisted.
*/
import { Pool, type PoolClient } from '@neondatabase/serverless';

const ARRAY_COLLS = ['schools', 'users', 'polls', 'votes', 'boosts', 'reports'] as const;
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

export class Store {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  /** Create the kv table if it doesn't exist yet. Call once before any other method. */
  async init(): Promise<void> {
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS kv (
         coll TEXT NOT NULL,
         id   TEXT NOT NULL,
         data JSONB NOT NULL,
         PRIMARY KEY (coll, id)
       )`
    );
  }

  async isEmpty(): Promise<boolean> {
    const { rows } = await this.pool.query('SELECT COUNT(*)::int AS n FROM kv');
    return rows[0].n === 0;
  }

  /** Reconstruct the in-memory db shape ({schools:[], users:[], sessions:{}, ...}). */
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

  async close(): Promise<void> {
    await this.pool.end();
  }
}
