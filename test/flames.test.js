'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { boot, shutdown, api } = require('./helpers');

let base, adminToken, schoolId;

before(async () => {
  ({ base } = await boot());
  const login = await api(base, 'POST', '/api/admin/login', { body: { passcode: 'gas-admin' } });
  adminToken = login.body.token;
  const school = await api(base, 'POST', '/api/admin/schools', { token: adminToken, body: { name: 'Flames High' } });
  schoolId = school.body.school.id;
});
after(async () => { await shutdown(); });

// Admin-created users always start with 2 coins (POST doesn't accept a coins override) — patch it in after.
async function makeUser(overrides = {}) {
  const { coins, ...postFields } = overrides;
  const create = await api(base, 'POST', '/api/admin/users', { token: adminToken, body: { schoolId, firstName: 'T', lastName: 'User', ...postFields } });
  const userId = create.body.user.id;
  if (coins !== undefined) {
    await api(base, 'PATCH', `/api/admin/users/${userId}`, { token: adminToken, body: { coins } });
  }
  const tok = await api(base, 'POST', `/api/admin/users/${userId}/token`, { token: adminToken });
  return { id: userId, token: tok.body.token };
}

async function voteTwice(voterToken, targetId) {
  const round = await api(base, 'GET', '/api/polls/round', { token: voterToken });
  const [q1, q2] = round.body.polls;
  await api(base, 'POST', '/api/vote', { token: voterToken, body: { questionId: q1.questionId, targetId, roundId: round.body.roundId } });
  await api(base, 'POST', '/api/vote', { token: voterToken, body: { questionId: q2.questionId, targetId, roundId: round.body.roundId } });
}

test('coin-reveal shows the initial and charges one coin', async () => {
  const voter = await makeUser({ firstName: 'Voter', lastName: 'One' });
  const target = await makeUser({ firstName: 'Target', lastName: 'Plain', coins: 5 });
  await voteTwice(voter.token, target.id);

  const before1 = await api(base, 'GET', '/api/flames', { token: target.token });
  assert.equal(before1.status, 200);
  assert.equal(before1.body.flames.length, 2);
  assert.equal(before1.body.flames[0].initial, null);
  assert.equal(before1.body.flames[0].repeatAdmirer, true); // picked twice by the same voter

  const flameId = before1.body.flames[0].id;
  const reveal = await api(base, 'POST', `/api/flames/${flameId}/reveal`, { token: target.token });
  assert.equal(reveal.status, 200);
  assert.equal(reveal.body.coins, 4);

  const after1 = await api(base, 'GET', '/api/flames', { token: target.token });
  assert.equal(after1.body.flames.find(f => f.id === flameId).initial, 'V');
});

test('reveal is rejected without enough coins', async () => {
  const voter = await makeUser({ firstName: 'Voter', lastName: 'Two' });
  const target = await makeUser({ firstName: 'Target', lastName: 'Poor', coins: 0 });
  await voteTwice(voter.token, target.id);
  const flames = await api(base, 'GET', '/api/flames', { token: target.token });
  const r = await api(base, 'POST', `/api/flames/${flames.body.flames[0].id}/reveal`, { token: target.token });
  assert.equal(r.status, 402);
});

test('an anonymous (God Mode) admirer cannot be revealed', async () => {
  const voter = await makeUser({ firstName: 'Anon', lastName: 'Voter', godMode: true });
  const target = await makeUser({ firstName: 'Target', lastName: 'Curious', coins: 5 });
  await voteTwice(voter.token, target.id);
  const flames = await api(base, 'GET', '/api/flames', { token: target.token });
  const r = await api(base, 'POST', `/api/flames/${flames.body.flames[0].id}/reveal`, { token: target.token });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /anonymous/);
});

test('reveal-name requires God Mode on the target', async () => {
  const voter = await makeUser({ firstName: 'Voter', lastName: 'Three' });
  const target = await makeUser({ firstName: 'Target', lastName: 'NoGod' });
  await voteTwice(voter.token, target.id);
  const flames = await api(base, 'GET', '/api/flames', { token: target.token });
  const r = await api(base, 'POST', `/api/flames/${flames.body.flames[0].id}/reveal-name`, { token: target.token });
  assert.equal(r.status, 402);
});

test('reveal-name requires being picked at least twice by that admirer', async () => {
  const voter = await makeUser({ firstName: 'Voter', lastName: 'Four' });
  const target = await makeUser({ firstName: 'Target', lastName: 'God1', godMode: true });
  const round = await api(base, 'GET', '/api/polls/round', { token: voter.token });
  const q = round.body.polls[0];
  await api(base, 'POST', '/api/vote', { token: voter.token, body: { questionId: q.questionId, targetId: target.id, roundId: round.body.roundId } });
  const flames = await api(base, 'GET', '/api/flames', { token: target.token });
  const r = await api(base, 'POST', `/api/flames/${flames.body.flames[0].id}/reveal-name`, { token: target.token });
  assert.equal(r.status, 400);
});

test('reveal-name allows at most 2 distinct admirers (bonus-reveal cap)', async () => {
  const target = await makeUser({ firstName: 'Target', lastName: 'GodCap', godMode: true });
  for (const name of ['Five', 'Six', 'Seven']) {
    const voter = await makeUser({ firstName: 'Voter', lastName: name });
    await voteTwice(voter.token, target.id);
  }
  const flames = await api(base, 'GET', '/api/flames', { token: target.token });
  assert.equal(flames.body.flames.length, 6); // 3 admirers x 2 picks each

  const results = [];
  for (const f of flames.body.flames) {
    results.push(await api(base, 'POST', `/api/flames/${f.id}/reveal-name`, { token: target.token }));
  }
  const rejected = results.filter(r => r.status === 402);
  const succeeded = results.filter(r => r.status === 200);
  assert.ok(rejected.length >= 1, 'a 3rd distinct admirer must eventually be rejected');
  assert.ok(succeeded.length >= 2, 'the first 2 distinct admirers should succeed');
  assert.equal(succeeded[succeeded.length - 1].body.bonusRevealsLeft, 0);
});

test('flames/read marks all flames as read', async () => {
  const voter = await makeUser({ firstName: 'Voter', lastName: 'Reader' });
  const target = await makeUser({ firstName: 'Target', lastName: 'Reader' });
  await voteTwice(voter.token, target.id);
  const markRead = await api(base, 'POST', '/api/flames/read', { token: target.token });
  assert.equal(markRead.status, 200);
  const flames = await api(base, 'GET', '/api/flames', { token: target.token });
  assert.ok(flames.body.flames.every(f => f.unread === false));
});
