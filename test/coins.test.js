'use strict';
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

test('boost/random is rejected when the user cannot afford it', async () => {
  // seeded students start with 2 coins; boost/random costs 100
  const r = await api(base, 'POST', '/api/boost/random', { token });
  assert.equal(r.status, 402);
});

test('boost/crush is rejected for an invalid target', async () => {
  const r = await api(base, 'POST', '/api/boost/crush', { token, body: { targetId: 'nope' } });
  assert.equal(r.status, 400);
});

test('completing a round pays out coins exactly once (no double-claim)', async () => {
  const roundRes = await api(base, 'GET', '/api/polls/round', { token });
  const roundId = roundRes.body.roundId;
  const q = roundRes.body.polls[0];

  const suggestions = await api(base, 'GET', '/api/suggestions', { token });
  const mate = suggestions.body.contacts[0] || suggestions.body.fof[0];
  const vote = await api(base, 'POST', '/api/vote', {
    token, body: { questionId: q.questionId, targetId: mate.id, roundId }
  });
  assert.equal(vote.status, 200);

  const before1 = await api(base, 'GET', '/api/me', { token });
  const first = await api(base, 'POST', '/api/round/complete', { token, body: { roundId } });
  assert.equal(first.status, 200);
  assert.equal(first.body.earned, 2); // non-God-Mode payout
  assert.equal(first.body.coins, before1.body.user.coins + 2);

  const second = await api(base, 'POST', '/api/round/complete', { token, body: { roundId } });
  assert.equal(second.status, 200);
  assert.equal(second.body.already, true);
  assert.equal(second.body.earned, 0);
  assert.equal(second.body.coins, first.body.coins); // unchanged on the double-claim
});

test('completing a round with zero answers is rejected', async () => {
  const roundRes = await api(base, 'GET', '/api/polls/round', { token });
  const r = await api(base, 'POST', '/api/round/complete', { token, body: { roundId: roundRes.body.roundId } });
  assert.equal(r.status, 400);
});
