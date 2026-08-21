import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { neon } from '@neondatabase/serverless';
import { env, resetDb } from './helpers';
import { runMigrations } from '../src/migrations';

/* The JSONB key rename, which is the one part of the Flame->Aura / God Mode->Infinite Aura rename
   that no typecheck can cover.

   `User` is `{ [key: string]: unknown }` (db.ts), so `me.infiniteAura` compiles whether or not any row
   has ever carried that key. If `renameLegacyUserKeys` silently does nothing — which is exactly what a
   well-meaning search-and-replace over its SQL produces — every existing paying member reads back as
   `undefined`, the app treats them as a non-member, and the whole suite stays green. Nothing else in
   here would notice.

   So these go around the migration directly rather than through the API: the point is what happens to
   rows written *before* the rename, and there is no longer any code path that can write one. */

const sql = neon(env.DATABASE_URL);

/** A row as it looked pre-rename, inserted straight past the app so it genuinely carries the old keys. */
async function insertLegacyUser(id: string, data: Record<string, unknown>): Promise<void> {
  await sql`INSERT INTO users (id, school_id, data) VALUES (${id}, NULL, ${JSON.stringify(data)}::jsonb)`;
}

async function dataOf(id: string): Promise<Record<string, unknown>> {
  const rows = await sql`SELECT data FROM users WHERE id = ${id}`;
  return rows[0].data as Record<string, unknown>;
}

before(async () => {
  await resetDb();
});

test('a paid member keeps their membership across the rename', async () => {
  await insertLegacyUser('u_member', {
    firstName: 'Paid',
    godMode: true,
    godModeExpires: '2030-01-01T00:00:00.000Z',
    notifyFlames: false
  });

  await runMigrations(sql);
  const data = await dataOf('u_member');

  assert.equal(data.infiniteAura, true, 'godMode must survive as infiniteAura — this is a paid membership');
  assert.equal(data.infiniteAuraExpires, '2030-01-01T00:00:00.000Z');
  assert.equal(data.notifyAuras, false, 'a false preference must survive as false, not vanish into its default');

  // Left behind, the old keys are worse than useless: they read as live state to anything still looking.
  for (const dead of ['godMode', 'godModeExpires', 'notifyFlames']) {
    assert.equal(dead in data, false, `${dead} should be gone`);
  }
  // Untouched keys stay untouched — this rebuilds the blob, so it has to put everything else back.
  assert.equal(data.firstName, 'Paid');
});

test('false and absent stay distinguishable', async () => {
  // A non-member with no expiry and no stored preference: the shape most rows actually have.
  await insertLegacyUser('u_free', { firstName: 'Free', godMode: false });

  await runMigrations(sql);
  const data = await dataOf('u_free');

  assert.equal(data.infiniteAura, false);
  /* The CASE arms exist for this. Without them the migration invents
     `infiniteAuraExpires: null` and `notifyAuras: null` on a row that never had either — and absent vs
     null is a real difference here, since push.ts reads a null preference as "never set, use my
     default" and the notifications screen renders that differently again. */
  assert.equal('infiniteAuraExpires' in data, false, 'must not invent an expiry the row never had');
  assert.equal('notifyAuras' in data, false, 'must not invent a preference the row never had');
});

test('running it again changes nothing', async () => {
  // Idempotency is what lets this live in runMigrations, which runs on every boot and every resetDb.
  const before = await dataOf('u_member');
  await runMigrations(sql);
  await runMigrations(sql);
  assert.deepEqual(await dataOf('u_member'), before);
});

test('a row already on the new vocabulary is left alone', async () => {
  // Every row written after the rename. The WHERE has to skip these rather than rebuild them.
  await insertLegacyUser('u_new', { firstName: 'New', infiniteAura: true, notifyAuras: true });

  await runMigrations(sql);
  const data = await dataOf('u_new');

  assert.equal(data.infiniteAura, true);
  assert.equal(data.notifyAuras, true);
  assert.equal(data.firstName, 'New');
});
