import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDb, callApi, createTestUser, joinSchool, seedPolls, type TestUser } from './helpers';

let admin: TestUser;
let schoolId: string;
const cleanupList: TestUser[] = [];

before(async () => {
  await resetDb();
  admin = await createTestUser({ admin: true });
  const school = await callApi('mutation($name:String!){ createSchool(name:$name){ id } }', { name: 'Flames High' }, admin.token);
  schoolId = school.body.data.createSchool.id;
  await seedPolls(admin.token, 4);
});
after(async () => {
  await admin.cleanup();
  for (const u of cleanupList) await u.cleanup();
});

async function makeSchoolUser(): Promise<TestUser> {
  const u = await createTestUser();
  await joinSchool(u.token, schoolId);
  cleanupList.push(u);
  return u;
}

async function voteTwice(voterToken: string, targetId: string): Promise<void> {
  const r = await callApi('{ pollRound { roundId polls { questionId } } }', undefined, voterToken);
  const [q1, q2] = r.body.data.pollRound.polls;
  await callApi('mutation($q:ID!,$t:ID!,$r:ID!){ vote(questionId:$q, targetId:$t, roundId:$r){ ok } }', { q: q1.questionId, t: targetId, r: r.body.data.pollRound.roundId }, voterToken);
  await callApi('mutation($q:ID!,$t:ID!,$r:ID!){ vote(questionId:$q, targetId:$t, roundId:$r){ ok } }', { q: q2.questionId, t: targetId, r: r.body.data.pollRound.roundId }, voterToken);
}

const FLAMES_QUERY = '{ flames { flames { id initial repeatAdmirer unread godMode } coins godMode } }';

test('coin-reveal shows the initial and charges one coin', async () => {
  const voter = await makeSchoolUser();
  await callApi('mutation{ updateMe(firstName:"Voter"){ id } }', undefined, voter.token);
  const target = await makeSchoolUser(); // fresh users start with 2 coins
  await voteTwice(voter.token, target.userId);

  const before1 = await callApi(FLAMES_QUERY, undefined, target.token);
  assert.equal(before1.body.data.flames.flames.length, 2);
  assert.equal(before1.body.data.flames.flames[0].initial, null);
  assert.equal(before1.body.data.flames.flames[0].repeatAdmirer, true); // picked twice by the same voter

  const flameId = before1.body.data.flames.flames[0].id;
  const meBefore = await callApi('{ me { coins } }', undefined, target.token);
  const reveal = await callApi('mutation($id:ID!){ revealFlame(id:$id){ ok coins } }', { id: flameId }, target.token);
  assert.equal(reveal.body.data.revealFlame.ok, true);
  assert.equal(reveal.body.data.revealFlame.coins, meBefore.body.data.me.coins - 1);

  const after1 = await callApi(FLAMES_QUERY, undefined, target.token);
  assert.equal(after1.body.data.flames.flames.find((f: any) => f.id === flameId).initial, 'V');
});

test('reveal is rejected without enough coins', async () => {
  const voter = await makeSchoolUser();
  const target = await makeSchoolUser();
  await callApi('mutation($cost:Int!){ shopBoost(cost:$cost){ coins } }', { cost: 2 }, target.token); // drain to 0
  await voteTwice(voter.token, target.userId);
  const flames = await callApi(FLAMES_QUERY, undefined, target.token);
  const r = await callApi('mutation($id:ID!){ revealFlame(id:$id){ ok } }', { id: flames.body.data.flames.flames[0].id }, target.token);
  assert.match(r.body.errors[0].message, /no coins/);
});

test('an anonymous (God Mode) admirer cannot be revealed', async () => {
  const voter = await makeSchoolUser();
  await callApi('mutation{ legacyGodMode }', undefined, voter.token);
  const target = await makeSchoolUser();
  await voteTwice(voter.token, target.userId);
  const flames = await callApi(FLAMES_QUERY, undefined, target.token);
  const r = await callApi('mutation($id:ID!){ revealFlame(id:$id){ ok } }', { id: flames.body.data.flames.flames[0].id }, target.token);
  assert.match(r.body.errors[0].message, /anonymous/);
});

test('reveal-name requires God Mode on the target', async () => {
  const voter = await makeSchoolUser();
  const target = await makeSchoolUser();
  await voteTwice(voter.token, target.userId);
  const flames = await callApi(FLAMES_QUERY, undefined, target.token);
  const r = await callApi('mutation($id:ID!){ revealFlameName(id:$id){ name } }', { id: flames.body.data.flames.flames[0].id }, target.token);
  assert.match(r.body.errors[0].message, /God Mode required/);
});

test('reveal-name requires being picked at least twice by that admirer', async () => {
  const voter = await makeSchoolUser();
  const target = await makeSchoolUser();
  await callApi('mutation{ legacyGodMode }', undefined, target.token);
  const r = await callApi('{ pollRound { roundId polls { questionId } } }', undefined, voter.token);
  const q = r.body.data.pollRound.polls[0];
  await callApi('mutation($q:ID!,$t:ID!,$r:ID!){ vote(questionId:$q, targetId:$t, roundId:$r){ ok } }', { q: q.questionId, t: target.userId, r: r.body.data.pollRound.roundId }, voter.token);
  const flames = await callApi(FLAMES_QUERY, undefined, target.token);
  const reveal = await callApi('mutation($id:ID!){ revealFlameName(id:$id){ name } }', { id: flames.body.data.flames.flames[0].id }, target.token);
  assert.match(reveal.body.errors[0].message, /picked you twice/);
});

test('reveal-name allows at most 2 distinct admirers (bonus-reveal cap)', async () => {
  const target = await makeSchoolUser();
  await callApi('mutation{ legacyGodMode }', undefined, target.token);
  for (let i = 0; i < 3; i++) {
    const voter = await makeSchoolUser();
    await voteTwice(voter.token, target.userId);
  }
  const flames = await callApi(FLAMES_QUERY, undefined, target.token);
  assert.equal(flames.body.data.flames.flames.length, 6); // 3 admirers x 2 picks each

  const results = [];
  for (const f of flames.body.data.flames.flames) {
    results.push(await callApi('mutation($id:ID!){ revealFlameName(id:$id){ name bonusRevealsLeft } }', { id: f.id }, target.token));
  }
  const rejected = results.filter(r => r.body.errors);
  const succeeded = results.filter(r => !r.body.errors);
  assert.ok(rejected.length >= 1, 'a 3rd distinct admirer must eventually be rejected');
  assert.ok(succeeded.length >= 2, 'the first 2 distinct admirers should succeed');
  assert.equal(succeeded[succeeded.length - 1].body.data.revealFlameName.bonusRevealsLeft, 0);
});

test('flames/read marks all flames as read', async () => {
  const voter = await makeSchoolUser();
  const target = await makeSchoolUser();
  await voteTwice(voter.token, target.userId);
  const markRead = await callApi('mutation{ markFlamesRead }', undefined, target.token);
  assert.equal(markRead.body.data.markFlamesRead, true);
  const flames = await callApi(FLAMES_QUERY, undefined, target.token);
  assert.ok(flames.body.data.flames.flames.every((f: any) => f.unread === false));
});
