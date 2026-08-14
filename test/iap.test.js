'use strict';
/* Error-path coverage only. A full happy-path test would need a real StoreKit2
   JWS signed by a self-signed X.509 chain (ES256 + x5c) — worth adding later,
   but out of scope for this first pass; see conversation notes. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { boot, shutdown, api } = require('./helpers');

let base, token;

before(async () => {
  ({ base } = await boot());
  const demo = await api(base, 'POST', '/api/auth/demo');
  token = demo.body.token;
});
after(async () => { await shutdown(); });

test('rejects a transaction that is not a 3-part JWS', async () => {
  const r = await api(base, 'POST', '/api/iap/validate', { token, body: { signedTransaction: 'not-a-real-jws' } });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /Invalid receipt/);
});

test('rejects a well-formed JWS with an empty cert chain', async () => {
  const bogus = [
    Buffer.from(JSON.stringify({ alg: 'ES256', x5c: [] })).toString('base64url'),
    Buffer.from(JSON.stringify({ productId: 'aura.godmode.weekly' })).toString('base64url'),
    'signature'
  ].join('.');
  const r = await api(base, 'POST', '/api/iap/validate', { token, body: { signedTransaction: bogus } });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /missing x5c chain/);
});

test('rejects an unsupported signing algorithm', async () => {
  const bogus = [
    Buffer.from(JSON.stringify({ alg: 'HS256', x5c: ['aaaa'] })).toString('base64url'),
    Buffer.from(JSON.stringify({ productId: 'aura.godmode.weekly' })).toString('base64url'),
    'signature'
  ].join('.');
  const r = await api(base, 'POST', '/api/iap/validate', { token, body: { signedTransaction: bogus } });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /unexpected alg/);
});

test('requires authentication', async () => {
  const r = await api(base, 'POST', '/api/iap/validate', { body: { signedTransaction: 'x.y.z' } });
  assert.equal(r.status, 401);
});
