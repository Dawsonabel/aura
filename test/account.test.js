'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { boot, shutdown, api } = require('./helpers');

let base;
before(async () => { ({ base } = await boot()); });
after(async () => { await shutdown(); });

test('PATCH /api/me updates allowed fields and sanitizes username', async () => {
  const demo = await api(base, 'POST', '/api/auth/demo');
  const token = demo.body.token;
  const patch = await api(base, 'PATCH', '/api/me', {
    token, body: { firstName: 'Updated', username: 'weird name!!', age: 16, hideTopFlames: true }
  });
  assert.equal(patch.status, 200);
  assert.equal(patch.body.user.firstName, 'Updated');
  assert.equal(patch.body.user.username, 'weirdname'); // non [a-zA-Z0-9_.] chars stripped
  assert.equal(patch.body.user.age, 16);
  assert.equal(patch.body.user.hideTopFlames, true);
});

test('PATCH /api/me ignores an out-of-range age', async () => {
  const demo = await api(base, 'POST', '/api/auth/demo');
  const token = demo.body.token;
  const before1 = await api(base, 'GET', '/api/me', { token });
  const patch = await api(base, 'PATCH', '/api/me', { token, body: { age: 999 } });
  assert.equal(patch.status, 200);
  assert.equal(patch.body.user.age, before1.body.user.age); // out of the 10-99 range, left unchanged
});

test('DELETE /api/me removes the account, kills the session, and cascades to friends', async () => {
  const a = await api(base, 'POST', '/api/auth/demo');
  const tokenA = a.body.token;
  const idA = a.body.user.id;

  const reqB = await api(base, 'POST', '/api/auth/request-code', { body: { phone: '5559990001' } });
  const loginB = await api(base, 'POST', '/api/auth/login', { body: { phone: '5559990001', code: reqB.body.devCode } });
  const tokenB = loginB.body.token;

  await api(base, 'POST', '/api/friends', { token: tokenA, body: { userId: loginB.body.user.id } });
  const meBBefore = await api(base, 'GET', '/api/me', { token: tokenB });
  assert.ok(meBBefore.body.user.friendIds.includes(idA));

  const del = await api(base, 'DELETE', '/api/me', { token: tokenA });
  assert.equal(del.status, 200);
  assert.equal(del.body.deleted, true);

  const meAAfter = await api(base, 'GET', '/api/me', { token: tokenA });
  assert.equal(meAAfter.status, 401); // session was deleted along with the account

  const meBAfter = await api(base, 'GET', '/api/me', { token: tokenB });
  assert.ok(!meBAfter.body.user.friendIds.includes(idA)); // cascaded off B's friend list
});
