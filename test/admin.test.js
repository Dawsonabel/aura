'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { boot, shutdown, api } = require('./helpers');

let base, adminToken;

before(async () => {
  ({ base } = await boot());
  const login = await api(base, 'POST', '/api/admin/login', { body: { passcode: 'gas-admin' } });
  assert.equal(login.status, 200);
  adminToken = login.body.token;
});
after(async () => { await shutdown(); });

test('admin routes reject requests with no token', async () => {
  const r = await api(base, 'GET', '/api/admin/stats');
  assert.equal(r.status, 401);
});

test('admin routes reject a regular user token', async () => {
  const demo = await api(base, 'POST', '/api/auth/demo');
  const r = await api(base, 'GET', '/api/admin/stats', { token: demo.body.token });
  assert.equal(r.status, 401);
});

test('admin login rejects a wrong passcode', async () => {
  const r = await api(base, 'POST', '/api/admin/login', { body: { passcode: 'wrong' } });
  assert.equal(r.status, 401);
});

test('stats reflects current counts with the right shape', async () => {
  const r = await api(base, 'GET', '/api/admin/stats', { token: adminToken });
  assert.equal(r.status, 200);
  for (const k of ['schools', 'users', 'polls', 'votes', 'godMode', 'reports']) {
    assert.equal(typeof r.body[k], 'number');
  }
});

test('schools: create, list, patch, delete', async () => {
  const create = await api(base, 'POST', '/api/admin/schools', { token: adminToken, body: { name: 'Test High', city: 'Testville' } });
  assert.equal(create.status, 200);
  const schoolId = create.body.school.id;

  const list = await api(base, 'GET', '/api/admin/schools', { token: adminToken });
  assert.equal(list.status, 200);
  assert.ok(list.body.schools.some(s => s.id === schoolId));

  const patch = await api(base, 'PATCH', `/api/admin/schools/${schoolId}`, { token: adminToken, body: { city: 'New City' } });
  assert.equal(patch.status, 200);
  assert.equal(patch.body.school.city, 'New City');

  const del = await api(base, 'DELETE', `/api/admin/schools/${schoolId}`, { token: adminToken });
  assert.equal(del.status, 200);
  const listAfter = await api(base, 'GET', '/api/admin/schools', { token: adminToken });
  assert.ok(!listAfter.body.schools.some(s => s.id === schoolId));
});

test('deleting a school clears schoolId on its users, without deleting them', async () => {
  const school = await api(base, 'POST', '/api/admin/schools', { token: adminToken, body: { name: 'Temp High' } });
  const schoolId = school.body.school.id;
  const user = await api(base, 'POST', '/api/admin/users', { token: adminToken, body: { schoolId, firstName: 'Temp', lastName: 'Kid' } });
  const userId = user.body.user.id;

  await api(base, 'DELETE', `/api/admin/schools/${schoolId}`, { token: adminToken });

  const list = await api(base, 'GET', '/api/admin/users', { token: adminToken });
  const found = list.body.users.find(u => u.id === userId);
  assert.ok(found, 'user should still exist');
  assert.equal(found.schoolId, null);
});

test('users: create, filter by school, patch, impersonate, delete cascades friendIds', async () => {
  const school = await api(base, 'POST', '/api/admin/schools', { token: adminToken, body: { name: 'Users Test High' } });
  const schoolId = school.body.school.id;

  const u1 = await api(base, 'POST', '/api/admin/users', { token: adminToken, body: { schoolId, firstName: 'A', lastName: 'One' } });
  const u2 = await api(base, 'POST', '/api/admin/users', { token: adminToken, body: { schoolId, firstName: 'B', lastName: 'Two' } });
  assert.equal(u1.status, 200);
  assert.equal(u2.status, 200);

  const filtered = await api(base, 'GET', `/api/admin/users?schoolId=${schoolId}`, { token: adminToken });
  assert.equal(filtered.status, 200);
  assert.equal(filtered.body.users.length, 2);

  const patch = await api(base, 'PATCH', `/api/admin/users/${u1.body.user.id}`, { token: adminToken, body: { coins: 50, godMode: true } });
  assert.equal(patch.status, 200);
  assert.equal(patch.body.user.coins, 50);
  assert.equal(patch.body.user.godMode, true);

  const impersonate = await api(base, 'POST', `/api/admin/users/${u1.body.user.id}/token`, { token: adminToken });
  assert.equal(impersonate.status, 200);
  assert.ok(impersonate.body.token);
  const me = await api(base, 'GET', '/api/me', { token: impersonate.body.token });
  assert.equal(me.body.user.id, u1.body.user.id);

  await api(base, 'POST', '/api/friends', { token: impersonate.body.token, body: { userId: u2.body.user.id } });
  const del = await api(base, 'DELETE', `/api/admin/users/${u2.body.user.id}`, { token: adminToken });
  assert.equal(del.status, 200);

  const meAfter = await api(base, 'GET', '/api/me', { token: impersonate.body.token });
  assert.ok(!meAfter.body.user.friendIds.includes(u2.body.user.id));
});

test('polls: create, list (includes lib), patch, delete', async () => {
  const create = await api(base, 'POST', '/api/admin/polls', { token: adminToken, body: { emoji: '🎯', text: 'Test poll', color: '#123456' } });
  assert.equal(create.status, 200);
  const pollId = create.body.poll.id;

  const list = await api(base, 'GET', '/api/admin/polls', { token: adminToken });
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(list.body.lib));
  assert.ok(list.body.polls.some(p => p.id === pollId));

  const patch = await api(base, 'PATCH', `/api/admin/polls/${pollId}`, { token: adminToken, body: { enabled: false } });
  assert.equal(patch.status, 200);
  assert.equal(patch.body.poll.enabled, false);

  const del = await api(base, 'DELETE', `/api/admin/polls/${pollId}`, { token: adminToken });
  assert.equal(del.status, 200);
});

test('votes: moderation list and delete', async () => {
  const list = await api(base, 'GET', '/api/admin/votes', { token: adminToken });
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(list.body.votes));
  if (list.body.votes.length) {
    const del = await api(base, 'DELETE', `/api/admin/votes/${list.body.votes[0].id}`, { token: adminToken });
    assert.equal(del.status, 200);
  }
});

test('reports: file as a user, see and resolve as admin', async () => {
  const demo = await api(base, 'POST', '/api/auth/demo');
  const report = await api(base, 'POST', '/api/report', { token: demo.body.token, body: { userId: demo.body.user.id, reason: 'unit-test-report' } });
  assert.equal(report.status, 200);

  const list = await api(base, 'GET', '/api/admin/reports', { token: adminToken });
  assert.equal(list.status, 200);
  const mine = list.body.reports.find(r => r.reason === 'unit-test-report');
  assert.ok(mine);

  const resolve = await api(base, 'POST', `/api/admin/reports/${mine.id}/resolve`, { token: adminToken });
  assert.equal(resolve.status, 200);
});

// Keep this last: it exhausts the per-IP admin-login rate limit for the rest of the process.
test('admin login rate-limits after repeated attempts', async () => {
  let limited = false;
  for (let i = 0; i < 15 && !limited; i++) {
    const r = await api(base, 'POST', '/api/admin/login', { body: { passcode: 'wrong' } });
    if (r.status === 429) limited = true;
  }
  assert.ok(limited, 'expected a 429 within 15 attempts');
});
