/* The candidate algorithm, in two halves.

   The arithmetic is pinned by unit tests on `candidateWeight` — sampling is stochastic, so asserting
   through pollRound would either flake or need thousands of draws (the same reasoning tuning.test.ts
   uses for resolveTuning). What IS asserted black-box are the deterministic promises: the never-picked
   seat guarantee and crush-boost delivery, which hold on every single round by construction. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { candidateWeight, type VoteStats } from '../src/pollRound';
import { TUNING_DEFAULTS } from '../src/tuning';
import type { User } from '../src/db';
import { resetDb, callApi, cleanupAll, createTestUser, joinSchool, seedPolls, seedVotes, type TestUser } from './helpers';

const T = { ...TUNING_DEFAULTS, weightLoyalPct: 200, weightCrossGenderPct: 200, weightUnderdogPct: 400, weightMemberPct: 125 };
const u = (over: Partial<User> = {}): User => ({ id: 'u1', schoolId: 'sch', ...over }) as User;
const ZERO: VoteStats = {};
/* The do-nothing-special fixture: received recently (not an underdog) but cast nothing (not loyal).
   `cast` must stay 0 here — the first version had cast: 3, which switched the loyalty factor on
   inside every test that meant to isolate a different one. */
const NEUTRAL: VoteStats = { m1: { cast: 0, received: 2, receivedEver: 9 } };

test('a schoolmate who received recently but cast nothing is the neutral baseline', () => {
  assert.equal(candidateWeight(u(), u({ id: 'm1' }), NEUTRAL, T), T.weightSchoolmate);
});

test('every factor lands alone: friend, loyalty, attraction, underdog, member', () => {
  const viewer = u({ gender: 'girl' });
  assert.equal(candidateWeight(u({ friends: ['m1'] }), u({ id: 'm1' }), NEUTRAL, T), T.weightFriend);
  assert.equal(candidateWeight(u(), u({ id: 'm1' }), { m1: { cast: 1, received: 1, receivedEver: 1 } }, T), 2, 'loyal voter doubles');
  assert.equal(candidateWeight(viewer, u({ id: 'm1', gender: 'boy' }), NEUTRAL, T), 2, 'girl sees boy doubled');
  assert.equal(candidateWeight(u({ gender: 'boy' }), u({ id: 'm1', gender: 'girl' }), NEUTRAL, T), 2, 'boy sees girl doubled');
  assert.equal(candidateWeight(u(), u({ id: 'm1' }), { m1: { cast: 1, received: 0, receivedEver: 5 } }, T), 2 * 4, 'nothing this week — underdog kicks in on top of loyalty');
  assert.equal(candidateWeight(u(), u({ id: 'm1', infiniteAura: true }), NEUTRAL, T), 1.25, 'member is a quiet 1.25');
});

test('non-binary, unset and same-gender pairs take no attraction factor in any direction', () => {
  for (const [a, b] of [['girl', 'girl'], ['boy', 'boy'], ['nonbinary', 'girl'], ['girl', 'nonbinary'], ['', 'boy'], ['boy', '']]) {
    assert.equal(candidateWeight(u({ gender: a }), u({ id: 'm1', gender: b }), NEUTRAL, T), 1, `${a || 'unset'} → ${b || 'unset'}`);
  }
});

test('factors multiply: a loyal opposite-gender member friend nobody picked this week stacks all five', () => {
  const w = candidateWeight(
    u({ gender: 'boy', friends: ['m1'] }),
    u({ id: 'm1', gender: 'girl', infiniteAura: true }),
    { m1: { cast: 5, received: 0, receivedEver: 2 } },
    T
  );
  assert.equal(w, 3 * 2 * 2 * 4 * 1.25);
});

test('a stranger with no stats row at all is loyal-less, underdog-boosted', () => {
  assert.equal(candidateWeight(u(), u({ id: 'ghost' }), ZERO, T), 4);
});

/* ---------- black-box: the deterministic promises ---------- */

let admin: TestUser, viewer: TestUser, popular: TestUser, invisible: TestUser, crushTarget: TestUser, admirer: TestUser;

before(async () => {
  await resetDb();
  admin = await createTestUser({ admin: true });
  viewer = await createTestUser();
  popular = await createTestUser();
  invisible = await createTestUser();
  /* The crush test needs its own viewer: pollRound *resumes* an unfinished round, so a viewer who has
     already been served one would get the pre-purchase round back and the splice could never show. */
  crushTarget = await createTestUser();
  /* And its own buyer, at a *different* school. In a four-person school every poll contains every
     schoolmate, so a same-school buyer is always present naturally and the splice (which skips polls
     already containing the booster) would never fire — the first version of this test found that out.
     A cross-school buyer can never be sampled naturally, so the boosted:true seat is the splice's
     doing on every run. (Also documents a real behavior: boostCrush doesn't require sharing a school.) */
  admirer = await createTestUser();
  const school = await callApi('mutation($name:String!){ createSchool(name:$name){ id } }', { name: 'Weights High' }, admin.token);
  const schoolId = school.body.data.createSchool.id;
  for (const t of [viewer, popular, invisible, crushTarget]) await joinSchool(t.token, schoolId);
  const school2 = await callApi('mutation($name:String!){ createSchool(name:$name){ id } }', { name: 'Elsewhere High' }, admin.token);
  await joinSchool(admirer.token, school2.body.data.createSchool.id);
  await seedPolls(admin.token, 4);
  // `popular` has history; `invisible` has never received a vote — the guarantee's subject.
  await seedVotes(viewer.userId, popular.userId, 2);
});
after(async () => {
  await cleanupAll(admin, viewer, popular, invisible, crushTarget, admirer);
});

test('someone who has never received an aura holds a seat in every round', async () => {
  const r = await callApi('{ pollRound { polls { choices { id } } } }', undefined, viewer.token);
  const ids = r.body.data.pollRound.polls.flatMap((p: any) => p.choices.map((c: any) => c.id));
  assert.ok(ids.includes(invisible.userId), 'the never-picked classmate is somewhere in the round');
});

test('a crush boost puts the buyer in the target round, marked boosted', async () => {
  await callApi('mutation($id:ID!,$coins:Int){ adminUpdateUser(id:$id, coins:$coins){ coins } }', { id: admirer.userId, coins: 1000 }, admin.token);
  const bought = await callApi('mutation($id:ID!){ boostCrush(targetId:$id){ coins } }', { id: crushTarget.userId }, admirer.token);
  assert.equal(bought.body.data.boostCrush.coins, 1000 - TUNING_DEFAULTS.boostCrushCost);

  const r = await callApi('{ pollRound { polls { choices { id boosted } } } }', undefined, crushTarget.token);
  const choices = r.body.data.pollRound.polls.flatMap((p: any) => p.choices);
  const placed = choices.find((c: any) => c.id === admirer.userId && c.boosted === true);
  assert.ok(placed, "the buyer is spliced into the crush's round with the boosted flag");
});
