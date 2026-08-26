/* Error-path coverage only — same scope as the old suite's iap.test.js. A full happy-path test
   would need a real StoreKit2 JWS signed by a self-signed X.509 chain (ES256 + x5c); worth adding
   later, out of scope here. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDb, callApi, createTestUser, type TestUser } from './helpers';

let user: TestUser;
before(async () => {
  await resetDb();
  user = await createTestUser();
});
after(async () => { await user.cleanup(); });

const VALIDATE = 'mutation($tx:String!){ validateIap(signedTransaction:$tx){ infiniteAura } }';

test('rejects a transaction that is not a 3-part JWS', async () => {
  const r = await callApi(VALIDATE, { tx: 'not-a-real-jws' }, user.token);
  assert.match(r.body.errors[0].message, /Invalid receipt/);
});

test('rejects a well-formed JWS with an empty cert chain', async () => {
  const bogus = [
    Buffer.from(JSON.stringify({ alg: 'ES256', x5c: [] })).toString('base64url'),
    Buffer.from(JSON.stringify({ productId: 'aura.godmode.weekly' })).toString('base64url'),
    'signature'
  ].join('.');
  const r = await callApi(VALIDATE, { tx: bogus }, user.token);
  assert.match(r.body.errors[0].message, /missing x5c chain/);
});

test('rejects an unsupported signing algorithm', async () => {
  const bogus = [
    Buffer.from(JSON.stringify({ alg: 'HS256', x5c: ['aaaa'] })).toString('base64url'),
    Buffer.from(JSON.stringify({ productId: 'aura.godmode.weekly' })).toString('base64url'),
    'signature'
  ].join('.');
  const r = await callApi(VALIDATE, { tx: bogus }, user.token);
  assert.match(r.body.errors[0].message, /unexpected alg/);
});

test('requires authentication', async () => {
  const r = await callApi(VALIDATE, { tx: 'x.y.z' });
  assert.match(r.body.errors[0].message, /Not logged in/);
});

/* The free unlock is a dev tool now, and this is the production posture pinned as a test: with the
   flag off, the paywall's legacy path cannot grant the paid tier. The flag is restored in finally —
   every other file in the suite mints its members through this mutation. */
test('legacyInfiniteAura refuses when dev tools are off', async () => {
  const { env } = await import('./helpers');
  const saved = (env as Record<string, unknown>).AURA_DEV_TOOLS;
  delete (env as Record<string, unknown>).AURA_DEV_TOOLS;
  try {
    const r = await callApi('mutation{ legacyInfiniteAura }', undefined, user.token);
    assert.match(r.body.errors[0].message, /Dev tools are not enabled/);
  } finally {
    (env as Record<string, unknown>).AURA_DEV_TOOLS = saved;
  }
  const on = await callApi('mutation{ legacyInfiniteAura }', undefined, user.token);
  assert.equal(on.body.data.legacyInfiniteAura, true, 'and works again with the flag back');
});
