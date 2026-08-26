import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDb, callApi, cleanupAll, createTestUser, joinSchool, seedPolls, type TestUser } from './helpers';

let admin: TestUser, me: TestUser, schoolmate: TestUser, outsider: TestUser;
let schoolId: string;
let round: { roundId: string; polls: { questionId: string }[] };

before(async () => {
  await resetDb();
  admin = await createTestUser({ admin: true });
  me = await createTestUser();
  schoolmate = await createTestUser();
  outsider = await createTestUser();

  const school = await callApi('mutation($name:String!){ createSchool(name:$name){ id } }', { name: 'Voting High' }, admin.token);
  const otherSchool = await callApi('mutation($name:String!){ createSchool(name:$name){ id } }', { name: 'Other High' }, admin.token);
  schoolId = school.body.data.createSchool.id;

  await joinSchool(me.token, schoolId);
  await joinSchool(schoolmate.token, schoolId);
  await joinSchool(outsider.token, otherSchool.body.data.createSchool.id);
  await seedPolls(admin.token, 4);

  const r = await callApi('{ pollRound { roundId polls { questionId } } }', undefined, me.token);
  round = r.body.data.pollRound;
  assert.ok(round.polls.length >= 3, 'need a few poll slots for the tests below');
});
// cleanupAll, not four bare awaits: a failed before() leaves some of these undefined, and the throw
// would abandon the rest — see the note on cleanupAll.
after(() => cleanupAll(admin, me, schoolmate, outsider));

const VOTE = 'mutation($q:ID!,$t:ID!,$r:ID!){ vote(questionId:$q, targetId:$t, roundId:$r){ ok dup } }';

test('cannot vote for yourself', async () => {
  const r = await callApi(VOTE, { q: round.polls[0].questionId, t: me.userId, r: round.roundId }, me.token);
  assert.match(r.body.errors[0].message, /cannot vote for yourself/);
});

test('cannot vote for someone at a different school', async () => {
  const r = await callApi(VOTE, { q: round.polls[0].questionId, t: outsider.userId, r: round.roundId }, me.token);
  assert.match(r.body.errors[0].message, /not eligible/);
});

test('cannot vote for a blocked user, even if otherwise eligible', async () => {
  const block = await callApi('mutation($id:ID!){ block(userId:$id) }', { id: schoolmate.userId }, me.token);
  assert.ok(block.body.data.block.includes(schoolmate.userId));

  const r = await callApi(VOTE, { q: round.polls[1].questionId, t: schoolmate.userId, r: round.roundId }, me.token);
  assert.match(r.body.errors[0].message, /not eligible/);

  const unblock = await callApi('mutation($id:ID!){ unblock(userId:$id) }', { id: schoolmate.userId }, me.token);
  assert.ok(!unblock.body.data.unblock.includes(schoolmate.userId));
});

test('a valid vote succeeds once, and is marked a dup on a repeat for the same question', async () => {
  const first = await callApi(VOTE, { q: round.polls[2].questionId, t: schoolmate.userId, r: round.roundId }, me.token);
  assert.equal(first.body.data.vote.ok, true);
  assert.equal(first.body.data.vote.dup, false);

  const second = await callApi(VOTE, { q: round.polls[2].questionId, t: schoolmate.userId, r: round.roundId }, me.token);
  assert.equal(second.body.data.vote.dup, true);
});
