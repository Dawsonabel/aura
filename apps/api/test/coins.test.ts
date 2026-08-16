import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDb, callApi, createTestUser, joinSchool, seedPolls, type TestUser } from './helpers';

let admin: TestUser, me: TestUser, mate: TestUser;

before(async () => {
  await resetDb();
  admin = await createTestUser({ admin: true });
  me = await createTestUser();
  mate = await createTestUser();
  const school = await callApi('mutation($name:String!){ createSchool(name:$name){ id } }', { name: 'Coins High' }, admin.token);
  const schoolId = school.body.data.createSchool.id;
  await joinSchool(me.token, schoolId);
  await joinSchool(mate.token, schoolId);
  await seedPolls(admin.token, 4);
});
after(async () => {
  await admin.cleanup();
  await me.cleanup();
  await mate.cleanup();
});

test('boostRandom is rejected when the user cannot afford it', async () => {
  // fresh users start with 2 coins; boostRandom costs 100
  const r = await callApi('mutation{ boostRandom { coins } }', undefined, me.token);
  assert.match(r.body.errors[0].message, /100 coins/);
});

test('boostCrush is rejected for an invalid target', async () => {
  const r = await callApi('mutation($id:ID!){ boostCrush(targetId:$id){ coins } }', { id: 'nope' }, me.token);
  assert.match(r.body.errors[0].message, /valid crush/);
});

test('completing a round pays out coins exactly once (no double-claim)', async () => {
  const roundRes = await callApi('{ pollRound { roundId polls { questionId } } }', undefined, me.token);
  const { roundId, polls } = roundRes.body.data.pollRound;

  const vote = await callApi(
    'mutation($q:ID!,$t:ID!,$r:ID!){ vote(questionId:$q, targetId:$t, roundId:$r){ ok } }',
    { q: polls[0].questionId, t: mate.userId, r: roundId },
    me.token
  );
  assert.equal(vote.body.data.vote.ok, true);

  const before1 = await callApi('{ me { coins } }', undefined, me.token);
  const first = await callApi('mutation($r:ID!){ completeRound(roundId:$r){ coins earned already } }', { r: roundId }, me.token);
  assert.equal(first.body.data.completeRound.earned, 2); // non-God-Mode payout
  assert.equal(first.body.data.completeRound.coins, before1.body.data.me.coins + 2);

  const second = await callApi('mutation($r:ID!){ completeRound(roundId:$r){ coins earned already } }', { r: roundId }, me.token);
  assert.equal(second.body.data.completeRound.already, true);
  assert.equal(second.body.data.completeRound.earned, 0);
  assert.equal(second.body.data.completeRound.coins, first.body.data.completeRound.coins); // unchanged on the double-claim
});

test('completing a round with zero answers is rejected', async () => {
  const roundRes = await callApi('{ pollRound { roundId } }', undefined, me.token);
  const r = await callApi('mutation($r:ID!){ completeRound(roundId:$r){ coins } }', { r: roundRes.body.data.pollRound.roundId }, me.token);
  assert.match(r.body.errors[0].message, /answer at least one/);
});
