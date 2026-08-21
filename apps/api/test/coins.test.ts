import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDb, callApi, cleanupAll, createTestUser, env, joinSchool, seedPolls, type TestUser } from './helpers';

let admin: TestUser, me: TestUser, mate: TestUser;

before(async () => {
  /* These tests are about payouts, not about the round allowance, and several of them need a second
     round for the same user. One round an hour (the real default) would starve them of one, so the
     dial is turned up for this file only — the allowance has its own coverage in pollRound's tests. */
  (env as Record<string, unknown>).AURA_ROUNDS_PER_HOUR = '20';
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
  delete (env as Record<string, unknown>).AURA_ROUNDS_PER_HOUR;
  await cleanupAll(admin, me, mate);
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

/* A full round is worth exactly what the round advertised, however that total is assembled.

   Asserted against the served `roundPayout` rather than any literal, and end to end rather than on the
   completion alone: the payout is split now — every vote pays as it lands and finishing adds a bonus —
   so checking only what completeRound returns would miss the larger half. What has to hold is that
   playing a whole round moves the balance by the number the Shop and the round both promise. */
test('a full round pays exactly the advertised total, once', async () => {
  const roundRes = await callApi(
    '{ pollRound { roundId roundPayout polls { questionId choices { id } } } }',
    undefined,
    me.token
  );
  const { roundId, roundPayout, polls } = roundRes.body.data.pollRound;
  const before = (await callApi('{ me { coins } }', undefined, me.token)).body.data.me.coins;

  // Every question, so the completion bonus is actually earned — a partial round deliberately isn't.
  for (const p of polls) {
    const vote = await callApi(
      'mutation($q:ID!,$t:ID!,$r:ID!){ vote(questionId:$q, targetId:$t, roundId:$r){ ok } }',
      { q: p.questionId, t: p.choices[0].id, r: roundId },
      me.token
    );
    assert.equal(vote.body.data.vote.ok, true);
  }

  const first = await callApi('mutation($r:ID!){ completeRound(roundId:$r){ coins earned already } }', { r: roundId }, me.token);
  assert.equal(first.body.data.completeRound.earned, roundPayout, 'the round pays what it advertised');
  assert.equal(first.body.data.completeRound.coins, before + roundPayout, 'votes plus bonus land on the balance');

  const second = await callApi('mutation($r:ID!){ completeRound(roundId:$r){ coins earned already } }', { r: roundId }, me.token);
  assert.equal(second.body.data.completeRound.already, true);
  assert.equal(second.body.data.completeRound.earned, 0);
  assert.equal(second.body.data.completeRound.coins, first.body.data.completeRound.coins); // unchanged on the double-claim
});

/* The bonus is for answering everything, not for pressing the button. */
test('a partial round keeps its per-vote pay and earns no completion bonus', async () => {
  const roundRes = await callApi(
    '{ pollRound { roundId roundPayout polls { questionId choices { id } } } }',
    undefined,
    me.token
  );
  const { roundId, roundPayout, polls } = roundRes.body.data.pollRound;
  const before = (await callApi('{ me { coins } }', undefined, me.token)).body.data.me.coins;

  const answered = 2;
  for (const p of polls.slice(0, answered)) {
    await callApi(
      'mutation($q:ID!,$t:ID!,$r:ID!){ vote(questionId:$q, targetId:$t, roundId:$r){ ok } }',
      { q: p.questionId, t: p.choices[0].id, r: roundId },
      me.token
    );
  }

  const done = await callApi('mutation($r:ID!){ completeRound(roundId:$r){ coins earned } }', { r: roundId }, me.token);
  const gained = done.body.data.completeRound.coins - before;
  assert.ok(gained > 0, 'the votes themselves still paid');
  assert.ok(gained < roundPayout, `a ${answered}-answer round must not pay the full ${roundPayout}`);
  assert.equal(done.body.data.completeRound.earned, gained, 'earned reports what the round actually moved');
});

test('completing a round with zero answers is rejected', async () => {
  const roundRes = await callApi('{ pollRound { roundId } }', undefined, me.token);
  const r = await callApi('mutation($r:ID!){ completeRound(roundId:$r){ coins } }', { r: roundRes.body.data.pollRound.roundId }, me.token);
  assert.match(r.body.errors[0].message, /answer at least one/);
});

const REROLL = 'mutation($r:ID!,$q:ID!){ rerollQuestion(roundId:$r, questionId:$q){ coins } }';

test('rerolling an answered question is refused — it would sell a second vote on it', async () => {
  const roundRes = await callApi('{ pollRound { roundId polls { questionId choices { id } } } }', undefined, me.token);
  const { roundId, polls } = roundRes.body.data.pollRound;
  await callApi(
    'mutation($q:ID!,$t:ID!,$r:ID!){ vote(questionId:$q, targetId:$t, roundId:$r){ ok } }',
    { q: polls[0].questionId, t: polls[0].choices[0].id, r: roundId },
    me.token
  );

  const r = await callApi(REROLL, { r: roundId, q: polls[0].questionId }, me.token);
  assert.match(r.body.errors[0].message, /already answered/);

  const notMine = await callApi(REROLL, { r: roundId, q: 'pol_nonexistent' }, me.token);
  assert.match(notMine.body.errors[0].message, /not in this round/);
});

/* The candidates are computed before the charge, so a school with nobody left to show refuses
   instead of taking the coins and handing back the same faces. This school has two students — the
   round already shows `me` everyone there is. */
test('a reroll that can find nobody new charges nothing', async () => {
  const roundRes = await callApi('{ pollRound { roundId polls { questionId } } }', undefined, me.token);
  const { roundId, polls } = roundRes.body.data.pollRound;
  const before = (await callApi('{ me { coins } }', undefined, me.token)).body.data.me.coins;

  const r = await callApi(REROLL, { r: roundId, q: polls[polls.length - 1].questionId }, me.token);
  assert.match(r.body.errors[0].message, /Nobody new/);

  const after = (await callApi('{ me { coins } }', undefined, me.token)).body.data.me.coins;
  assert.equal(after, before, 'a failed reroll must not move the balance');
});
