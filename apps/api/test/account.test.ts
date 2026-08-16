import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDb, callApi, createTestUser, type TestUser } from './helpers';

let user: TestUser;
before(async () => {
  await resetDb();
  user = await createTestUser();
});
after(async () => { await user.cleanup(); });

test('updateMe updates allowed fields and sanitizes username', async () => {
  const r = await callApi(
    `mutation($u:String,$a:Int,$h:Boolean){ updateMe(firstName:"Updated", username:$u, age:$a, hideTopFlames:$h){ firstName username age hideTopFlames } }`,
    { u: 'weird name!!', a: 16, h: true },
    user.token
  );
  const u = r.body.data.updateMe;
  assert.equal(u.firstName, 'Updated');
  assert.equal(u.username, 'weirdname'); // non [a-zA-Z0-9_.] chars stripped
  assert.equal(u.age, 16);
  assert.equal(u.hideTopFlames, true);
});

test('updateMe rejects an out-of-range age, leaving the stored value unchanged', async () => {
  const before1 = await callApi('{ me { age } }', undefined, user.token);
  const patch = await callApi('mutation{ updateMe(age:999){ age } }', undefined, user.token);
  assert.match(patch.body.errors[0].message, /at least 13/);
  const after1 = await callApi('{ me { age } }', undefined, user.token);
  assert.equal(after1.body.data.me.age, before1.body.data.me.age);
});

test('updateMe rejects an under-13 age', async () => {
  const r = await callApi('mutation{ updateMe(age:12){ age } }', undefined, user.token);
  assert.match(r.body.errors[0].message, /at least 13/);
});

test('onboarding cannot complete without a valid 13+ age on file', async () => {
  const fresh = await createTestUser();
  const me = await callApi('{ me { onboarded age } }', undefined, fresh.token);
  assert.equal(me.body.data.me.onboarded, false);
  assert.equal(me.body.data.me.age, null); // fresh identity, age never set

  const attempt = await callApi('mutation{ updateMe(onboarded:true){ onboarded } }', undefined, fresh.token);
  assert.match(attempt.body.errors[0].message, /before finishing onboarding/);

  const setAge = await callApi('mutation{ updateMe(age:15){ age } }', undefined, fresh.token);
  assert.equal(setAge.body.data.updateMe.age, 15);
  const finish = await callApi('mutation{ updateMe(onboarded:true){ onboarded } }', undefined, fresh.token);
  assert.equal(finish.body.data.updateMe.onboarded, true);
  await fresh.cleanup();
});

test('deleteMe removes the account and cascades off friends’ friend lists', async () => {
  const a = await createTestUser();
  const b = await createTestUser();

  await callApi('mutation($id:ID!){ addFriend(userId:$id) }', { id: b.userId }, a.token);
  const meBBefore = await callApi('{ me { friendIds } }', undefined, b.token);
  assert.ok(meBBefore.body.data.me.friendIds.includes(a.userId));

  const del = await callApi('mutation{ deleteMe }', undefined, a.token);
  assert.equal(del.body.data.deleteMe, true);

  const meBAfter = await callApi('{ me { friendIds } }', undefined, b.token);
  assert.ok(!meBAfter.body.data.me.friendIds.includes(a.userId)); // cascaded off B's friend list

  // Unlike the old REST session model, Clerk owns the session independently of the app-side row —
  // deleting your profile doesn't invalidate your Clerk token. The next authenticated request just
  // lazily recreates a fresh row (see getOrCreateUserByClerkId), same as a brand-new identity would.
  const meAAfter = await callApi('{ me { id friendIds } }', undefined, a.token);
  assert.notEqual(meAAfter.body.data.me.id, a.userId);

  await a.cleanup();
  await b.cleanup();
});
