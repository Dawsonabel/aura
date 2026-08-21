import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDb, callApi, createTestUser, joinSchool, type TestUser } from './helpers';

let user: TestUser;
before(async () => {
  await resetDb();
  user = await createTestUser();
});
after(async () => { await user.cleanup(); });

test('updateMe updates allowed fields and sanitizes username', async () => {
  const r = await callApi(
    `mutation($u:String,$a:Int,$h:Boolean){ updateMe(firstName:"Updated", username:$u, age:$a, hideTopAuras:$h){ firstName username age hideTopAuras } }`,
    { u: 'weird name!!', a: 16, h: true },
    user.token
  );
  const u = r.body.data.updateMe;
  assert.equal(u.firstName, 'Updated');
  assert.equal(u.username, 'weirdname'); // non [a-zA-Z0-9_.] chars stripped
  assert.equal(u.age, 16);
  assert.equal(u.hideTopAuras, true);
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

test('deleteMe removes the account and cascades off other people’s friend lists', async () => {
  /* A real friendship, not a one-way edge: A asks, B accepts, and only then is there something on B's
     row to cascade off. Both users need to be at the same school, since friending is school-scoped. */
  const admin = await createTestUser({ admin: true });
  const school = await callApi(
    'mutation($name:String!){ createSchool(name:$name){ id } }',
    { name: 'Cascade High ' + Date.now() },
    admin.token
  );
  const schoolId = school.body.data.createSchool.id;

  const a = await createTestUser();
  const b = await createTestUser();
  await joinSchool(a.token, schoolId);
  await joinSchool(b.token, schoolId);

  await callApi('mutation($id:ID!){ sendFriendRequest(userId:$id) }', { id: b.userId }, a.token);
  await callApi('mutation($id:ID!){ acceptFriendRequest(userId:$id) }', { id: a.userId }, b.token);
  const meBBefore = await callApi('{ me { friends } }', undefined, b.token);
  assert.ok(meBBefore.body.data.me.friends.includes(a.userId), 'A and B are friends to begin with');

  const del = await callApi('mutation{ deleteMe }', undefined, a.token);
  assert.equal(del.body.data.deleteMe, true);

  /* The cascade that matters: a dangling id would sit in B's friend list forever, and B could never
     clear it because the person no longer exists to unfriend. */
  const meBAfter = await callApi('{ me { friends } }', undefined, b.token);
  assert.ok(!meBAfter.body.data.me.friends.includes(a.userId), 'cascaded off B’s friend list');
  await admin.cleanup();

  // Unlike the old REST session model, Clerk owns the session independently of the app-side row —
  // deleting your profile doesn't invalidate your Clerk token. The next authenticated request just
  // lazily recreates a fresh row (see getOrCreateUserByClerkId), same as a brand-new identity would.
  const meAAfter = await callApi('{ me { id friends } }', undefined, a.token);
  assert.notEqual(meAAfter.body.data.me.id, a.userId);

  await a.cleanup();
  await b.cleanup();
});

/* The friendship lifecycle, and the privacy rule that hangs off it.

   Four things worth pinning, each of which is a way the old one-directional follow model would have
   let something through: a request is pending until answered, denying leaves nothing behind, the
   friend list is readable only by its owner, and two people asking each other at the same time end up
   friends rather than deadlocked with crossed requests. */
async function friendPair() {
  const admin = await createTestUser({ admin: true });
  const school = await callApi(
    'mutation($name:String!){ createSchool(name:$name){ id } }',
    { name: 'Friends High ' + Date.now() },
    admin.token
  );
  const schoolId = school.body.data.createSchool.id;
  const a = await createTestUser();
  const b = await createTestUser();
  await joinSchool(a.token, schoolId);
  await joinSchool(b.token, schoolId);
  return { admin, a, b };
}

test('a friend request is pending until accepted, and then mutual', async () => {
  const { admin, a, b } = await friendPair();

  await callApi('mutation($id:ID!){ sendFriendRequest(userId:$id) }', { id: b.userId }, a.token);

  // Pending: neither side is a friend yet, and each sees the request from their own angle.
  const aPending = await callApi('{ me { friends } }', undefined, a.token);
  assert.deepEqual(aPending.body.data.me.friends, [], 'sending is not friending');
  const bInbox = await callApi('{ friendRequests { id } }', undefined, b.token);
  assert.deepEqual(bInbox.body.data.friendRequests.map((u: { id: string }) => u.id), [a.userId]);

  await callApi('mutation($id:ID!){ acceptFriendRequest(userId:$id) }', { id: a.userId }, b.token);

  // Mutual, and the request is consumed rather than left lying around.
  const aAfter = await callApi('{ me { friends } }', undefined, a.token);
  const bAfter = await callApi('{ me { friends } friendRequests { id } }', undefined, b.token);
  assert.deepEqual(aAfter.body.data.me.friends, [b.userId]);
  assert.deepEqual(bAfter.body.data.me.friends, [a.userId]);
  assert.deepEqual(bAfter.body.data.friendRequests, [], 'the accepted request is gone');

  await Promise.all([admin.cleanup(), a.cleanup(), b.cleanup()]);
});

test('denying clears the request from both sides and creates nothing', async () => {
  const { admin, a, b } = await friendPair();

  await callApi('mutation($id:ID!){ sendFriendRequest(userId:$id) }', { id: b.userId }, a.token);
  await callApi('mutation($id:ID!){ denyFriendRequest(userId:$id) }', { id: a.userId }, b.token);

  const bAfter = await callApi('{ me { friends } friendRequests { id } }', undefined, b.token);
  assert.deepEqual(bAfter.body.data.friendRequests, []);
  assert.deepEqual(bAfter.body.data.me.friends, []);
  /* The sender's side is cleared too. A denied request that still reads as "sent" on A's screen would
     leave them waiting on an answer that already came. */
  const aState = await callApi('{ schoolmates { id friendState } }', undefined, a.token);
  const row = aState.body.data.schoolmates.find((u: { id: string }) => u.id === b.userId);
  assert.equal(row.friendState, 'none');

  await Promise.all([admin.cleanup(), a.cleanup(), b.cleanup()]);
});

test('asking someone who already asked you accepts instead of crossing requests', async () => {
  const { admin, a, b } = await friendPair();

  await callApi('mutation($id:ID!){ sendFriendRequest(userId:$id) }', { id: b.userId }, a.token);
  // B taps Add on A rather than answering the request — the common race, and it must not deadlock.
  await callApi('mutation($id:ID!){ sendFriendRequest(userId:$id) }', { id: a.userId }, b.token);

  const aAfter = await callApi('{ me { friends } }', undefined, a.token);
  const bAfter = await callApi('{ me { friends } friendRequests { id } }', undefined, b.token);
  assert.deepEqual(aAfter.body.data.me.friends, [b.userId], 'both taps resolve to a friendship');
  assert.deepEqual(bAfter.body.data.me.friends, [a.userId]);
  assert.deepEqual(bAfter.body.data.friendRequests, []);

  await Promise.all([admin.cleanup(), a.cleanup(), b.cleanup()]);
});

test('you cannot read anyone else’s friend list', async () => {
  const { admin, a, b } = await friendPair();
  await callApi('mutation($id:ID!){ sendFriendRequest(userId:$id) }', { id: b.userId }, a.token);
  await callApi('mutation($id:ID!){ acceptFriendRequest(userId:$id) }', { id: a.userId }, b.token);

  /* B is friends with A, but A asking the school about B gets an empty list — not B's real one. This
     is the whole privacy rule: in a school this size a readable friend graph is a social map, so the
     field is gated server-side rather than by clients choosing not to select it. */
  const mates = await callApi('{ schoolmates { id friends friendState } }', undefined, a.token);
  const bRow = mates.body.data.schoolmates.find((u: { id: string }) => u.id === b.userId);
  assert.deepEqual(bRow.friends, [], 'somebody else’s friend list is never returned');
  assert.equal(bRow.friendState, 'friends', 'but where *you* stand with them is');

  await Promise.all([admin.cleanup(), a.cleanup(), b.cleanup()]);
});
