'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { boot, shutdown, api } = require('./helpers');

let base;

before(async () => { ({ base } = await boot()); });
after(async () => { await shutdown(); });

test('request-code rate-limits after 5 requests for the same phone within 15 min', async () => {
  const phone = '5551230001';
  for (let i = 0; i < 5; i++) {
    const r = await api(base, 'POST', '/api/auth/request-code', { body: { phone } });
    assert.equal(r.status, 200, `request ${i + 1} should succeed`);
  }
  const sixth = await api(base, 'POST', '/api/auth/request-code', { body: { phone } });
  assert.equal(sixth.status, 429);
});

test('login succeeds with the correct dev-mode code and creates a session', async () => {
  const phone = '5551230002';
  const req = await api(base, 'POST', '/api/auth/request-code', { body: { phone } });
  assert.equal(req.status, 200);
  assert.ok(req.body.devCode, 'dev mode should return the code on-screen');

  const login = await api(base, 'POST', '/api/auth/login', { body: { phone, code: req.body.devCode } });
  assert.equal(login.status, 200);
  assert.ok(login.body.token);
  assert.equal(login.body.user.onboarded, false); // brand-new user, not yet onboarded

  const me = await api(base, 'GET', '/api/me', { token: login.body.token });
  assert.equal(me.status, 200);
  assert.equal(me.body.user.id, login.body.user.id);
});

test('login is rejected and locked out after 5 wrong codes, even with the right one after', async () => {
  const phone = '5551230003';
  const req = await api(base, 'POST', '/api/auth/request-code', { body: { phone } });
  for (let i = 0; i < 5; i++) {
    const r = await api(base, 'POST', '/api/auth/login', { body: { phone, code: '000000' } });
    assert.equal(r.status, 401, `attempt ${i + 1} should be rejected as incorrect`);
  }
  const sixth = await api(base, 'POST', '/api/auth/login', { body: { phone, code: req.body.devCode } });
  assert.equal(sixth.status, 429);
});

test('login fails for a phone number with no outstanding code', async () => {
  const r = await api(base, 'POST', '/api/auth/login', { body: { phone: '5551230099', code: '123456' } });
  assert.equal(r.status, 400);
});

test('protected routes reject requests with no token', async () => {
  const r = await api(base, 'GET', '/api/me');
  assert.equal(r.status, 401);
});
