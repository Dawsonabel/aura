/* ===== Gas clone — real persistence layer (SQLite via node:sqlite) =====
   Durable, transactional, WAL-mode store that backs the in-memory `db` object.
   The app keeps its existing in-memory model; this module loads it on boot and
   persists it atomically on save() — no more whole-file JSON rewrites that can
   truncate/corrupt under concurrent writes.

   Collections stored as documents in a single kv(coll,id,json) table:
     arrays  : schools, users, polls, votes, boosts, reports
     maps    : sessions, rounds        (keyed by their object key)
     single  : meta
   Ephemeral data (SMS codes) stays in memory and is intentionally NOT persisted.
*/
const { DatabaseSync } = require('node:sqlite');

const ARRAY_COLLS = ['schools', 'users', 'polls', 'votes', 'boosts', 'reports'];
const MAP_COLLS   = ['sessions', 'rounds'];

class Store {
  constructor(file) {
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA synchronous = NORMAL;');
    this.db.exec('CREATE TABLE IF NOT EXISTS kv (coll TEXT NOT NULL, id TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY (coll, id));');
    this._insert = this.db.prepare('INSERT INTO kv (coll, id, json) VALUES (?, ?, ?)');
    this._clear  = this.db.prepare('DELETE FROM kv');
  }

  isEmpty() {
    return this.db.prepare('SELECT COUNT(*) AS n FROM kv').get().n === 0;
  }

  /** Reconstruct the in-memory db shape ({schools:[], users:[], sessions:{}, ...}). */
  loadInto() {
    const out = {};
    for (const c of ARRAY_COLLS) out[c] = [];
    for (const c of MAP_COLLS) out[c] = {};
    out.meta = {};
    const rows = this.db.prepare('SELECT coll, id, json FROM kv').all();
    for (const r of rows) {
      const v = JSON.parse(r.json);
      if (r.coll === 'meta') out.meta = v;
      else if (MAP_COLLS.includes(r.coll)) out[r.coll][r.id] = v;
      else if (ARRAY_COLLS.includes(r.coll)) out[r.coll].push(v);
    }
    return out;
  }

  /** Persist the whole in-memory db atomically. Small-data safe (replace-in-transaction). */
  persist(db) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this._clear.run();
      for (const c of ARRAY_COLLS)
        for (const item of (db[c] || []))
          if (item && item.id != null) this._insert.run(c, String(item.id), JSON.stringify(item));
      for (const c of MAP_COLLS)
        for (const key of Object.keys(db[c] || {}))
          this._insert.run(c, key, JSON.stringify(db[c][key]));
      this._insert.run('meta', 'meta', JSON.stringify(db.meta || {}));
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
}

module.exports = { Store };
