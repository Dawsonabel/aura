'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { boot, shutdown, api } = require('./helpers');

let base, token, me, schoolmateId, otherSchoolUserId, round;

before(async () => {
  ({ base } = await boot());

  // log in as a seeded student (Lincoln High)
  const demo = await api(base, 'POST', '/api/auth/demo');
  assert.equal(demo.status, 200);
  token = demo.body.token;
  me = demo.body.user;

  // a valid, eligible target: a schoolmate
  const suggestions = await api(base, 'GET', '/api/suggestions', { token });
  const mate = suggestions.body.contacts[0] || suggestions.body.fof[0];
  assert.ok(mate, 'seed data should include schoolmates to pick from');
  schoolmateId = mate.id;

  // an ineligible target: a user at a different school, via the admin API
  const adminLogin = await api(base, 'POST', '/api/admin/login', { body: { passcode: 'aura-admin' } });
  assert.equal(adminLogin.status, 200);
  const adminToken = adminLogin.body.token;
  const school = await api(base, 'POST', '/api/admin/schools', { token: adminToken, body: { name: 'Other High' } });
  const otherUser = await api(base, 'POST', '/api/admin/users', {
    token: adminToken,
    body: { schoolId: school.body.school.id, firstName: 'Out', lastName: 'Sider' }
  });
  otherSchoolUserId = otherUser.body.user.id;

  const r = await api(base, 'GET', '/api/polls/round', { token });
  assert.equal(r.status, 200);
  round = r.body;
  assert.ok(round.polls.length >= 3, 'need a few poll slots for the tests below');
});
after(async () => { await shutdown(); });

test('cannot vote for yourself', async () => {
  const q = round.polls[0];
  const r = await api(base, 'POST', '/api/vote', {
    token, body: { questionId: q.questionId, targetId: me.id, roundId: round.roundId }
  });
  assert.equal(r.status, 400);
});

test('cannot vote for someone at a different school', async () => {
  const q = round.polls[0];
  const r = await api(base, 'POST', '/api/vote', {
    token, body: { questionId: q.questionId, targetId: otherSchoolUserId, roundId: round.roundId }
  });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'not eligible');
});

test('cannot vote for a blocked user, even if otherwise eligible', async () => {
  const block = await api(base, 'POST', '/api/block', { token, body: { userId: schoolmateId } });
  assert.equal(block.status, 200);

  const q = round.polls[1];
  const r = await api(base, 'POST', '/api/vote', {
    token, body: { questionId: q.questionId, targetId: schoolmateId, roundId: round.roundId }
  });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'not eligible');

  const unblock = await api(base, 'DELETE', '/api/block', { token, body: { userId: schoolmateId } });
  assert.equal(unblock.status, 200);
});

test('a valid vote succeeds once, and is marked a dup on a repeat for the same question', async () => {
  const q = round.polls[2];
  const first = await api(base, 'POST', '/api/vote', {
    token, body: { questionId: q.questionId, targetId: schoolmateId, roundId: round.roundId }
  });
  assert.equal(first.status, 200);
  assert.equal(first.body.dup, undefined);

  const second = await api(base, 'POST', '/api/vote', {
    token, body: { questionId: q.questionId, targetId: schoolmateId, roundId: round.roundId }
  });
  assert.equal(second.status, 200);
  assert.equal(second.body.dup, true);
});
