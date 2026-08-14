'use strict';
/* Shared test harness: boots the real HTTP server against a disposable Neon
   test branch, resetting it before each test file. Black-box only — tests
   talk to the API over HTTP, never touch server.js internals directly, so
   they keep passing across storage/framework refactors. */

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL is not set — point it at a disposable Neon branch (see README). Refusing to run tests without it.');
}
if (TEST_DATABASE_URL === process.env.DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must not equal DATABASE_URL — tests drop and reseed their database on every run.');
}
process.env.DATABASE_URL = TEST_DATABASE_URL; // server.js reads this at require-time

const { Pool } = require('@neondatabase/serverless');
const app = require('../server');

async function resetDb() {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  try { await pool.query('DROP TABLE IF EXISTS kv'); }
  finally { await pool.end(); }
}

/** Wipe the test DB and boot a fresh server instance (seeded, on a random free port). */
async function boot() {
  await resetDb();
  const server = await app.start(0);
  return { base: `http://localhost:${server.address().port}` };
}

async function shutdown() {
  await app.stop();
}

async function api(base, method, path, { token, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'x-token': token } : {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let parsed;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

module.exports = { boot, shutdown, api };
