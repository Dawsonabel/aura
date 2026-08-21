import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDb, callApi, createTestUser, type TestUser } from './helpers';

/* Old suite's admin.test.js also covered admin user create/patch/impersonate. Phase 14 added
   `users`/`adminUpdateUser`/`adminDeleteUser`, closing the patch/list/delete gap — but not create
   or impersonate: Clerk owns identity now, so admins can't fabricate a student row without a real
   Clerk sign-up, and impersonation (full account takeover) was deliberately deferred as its own
   security-sensitive feature, not bundled in here. */

let admin: TestUser, student: TestUser;
before(async () => {
  await resetDb();
  admin = await createTestUser({ admin: true });
  student = await createTestUser();
});
after(async () => {
  await admin.cleanup();
  await student.cleanup();
});

test('admin-gated queries and mutations reject no token', async () => {
  const r = await callApi('{ adminStats { schools } }');
  assert.match(r.body.errors[0].message, /Admin only/);
});

test('admin-gated queries and mutations reject a regular student token', async () => {
  const r = await callApi('{ adminStats { schools } }', undefined, student.token);
  assert.match(r.body.errors[0].message, /Admin only/);
});

test('adminStats reflects current counts with the right shape', async () => {
  const r = await callApi('{ adminStats { schools users polls votes infiniteAura reports } }', undefined, admin.token);
  for (const k of ['schools', 'users', 'polls', 'votes', 'infiniteAura', 'reports']) {
    assert.equal(typeof r.body.data.adminStats[k], 'number');
  }
});

test('schools: create, list, update, delete', async () => {
  const create = await callApi(
    'mutation($name:String!,$city:String){ createSchool(name:$name, city:$city){ id name city } }',
    { name: 'Test High', city: 'Testville' },
    admin.token
  );
  const schoolId = create.body.data.createSchool.id;

  const list = await callApi('{ schools { id } }');
  assert.ok(list.body.data.schools.some((s: any) => s.id === schoolId));

  const update = await callApi(
    'mutation($id:ID!,$city:String){ updateSchool(id:$id, city:$city){ city } }',
    { id: schoolId, city: 'New City' },
    admin.token
  );
  assert.equal(update.body.data.updateSchool.city, 'New City');

  const del = await callApi('mutation($id:ID!){ deleteSchool(id:$id) }', { id: schoolId }, admin.token);
  assert.equal(del.body.data.deleteSchool, true);
  const listAfter = await callApi('{ schools { id } }');
  assert.ok(!listAfter.body.data.schools.some((s: any) => s.id === schoolId));
});

test('deleting a school clears schoolId on its users, without deleting them', async () => {
  const school = await callApi('mutation($name:String!){ createSchool(name:$name){ id } }', { name: 'Temp High' }, admin.token);
  const schoolId = school.body.data.createSchool.id;

  const kid = await createTestUser();
  await callApi('mutation($schoolId:ID){ updateMe(schoolId:$schoolId){ id } }', { schoolId }, kid.token);

  await callApi('mutation($id:ID!){ deleteSchool(id:$id) }', { id: schoolId }, admin.token);

  const found = await callApi('query($id:ID!){ user(id:$id){ schoolId } }', { id: kid.userId }, admin.token);
  assert.equal(found.body.data.user.schoolId, null);
  await kid.cleanup();
});

test('polls: create, list (includes library), update, delete', async () => {
  const create = await callApi(
    'mutation($emoji:String!,$text:String!,$color:String!){ createPoll(emoji:$emoji, text:$text, color:$color){ id enabled } }',
    { emoji: '🎯', text: 'Test poll', color: '#123456' },
    admin.token
  );
  const pollId = create.body.data.createPoll.id;

  const lib = await callApi('{ pollLibrary { emoji } }');
  assert.ok(lib.body.data.pollLibrary.length > 0);
  const list = await callApi('{ polls { id } }', undefined, admin.token);
  assert.ok(list.body.data.polls.some((p: any) => p.id === pollId));

  const update = await callApi('mutation($id:ID!,$enabled:Boolean){ updatePoll(id:$id, enabled:$enabled){ enabled } }', { id: pollId, enabled: false }, admin.token);
  assert.equal(update.body.data.updatePoll.enabled, false);

  const del = await callApi('mutation($id:ID!){ deletePoll(id:$id) }', { id: pollId }, admin.token);
  assert.equal(del.body.data.deletePoll, true);
});

test('users: list (optionally scoped to a school), admin-update, admin-delete', async () => {
  const school = await callApi('mutation($name:String!){ createSchool(name:$name){ id } }', { name: 'Users-List High' }, admin.token);
  const schoolId = school.body.data.createSchool.id;

  const kid = await createTestUser();
  await callApi('mutation($schoolId:ID){ updateMe(schoolId:$schoolId){ id } }', { schoolId }, kid.token);

  const scoped = await callApi('query($schoolId:ID){ users(schoolId:$schoolId){ id } }', { schoolId }, admin.token);
  assert.ok(scoped.body.data.users.some((u: any) => u.id === kid.userId));

  const unscoped = await callApi('{ users { id } }', undefined, admin.token);
  assert.ok(unscoped.body.data.users.some((u: any) => u.id === kid.userId));
  assert.ok(unscoped.body.data.users.some((u: any) => u.id === student.userId));

  const updated = await callApi(
    'mutation($id:ID!,$coins:Int,$infiniteAura:Boolean){ adminUpdateUser(id:$id, coins:$coins, infiniteAura:$infiniteAura){ coins infiniteAura } }',
    { id: kid.userId, coins: 999, infiniteAura: true },
    admin.token
  );
  assert.equal(updated.body.data.adminUpdateUser.coins, 999);
  assert.equal(updated.body.data.adminUpdateUser.infiniteAura, true);

  const del = await callApi('mutation($id:ID!){ adminDeleteUser(id:$id) }', { id: kid.userId }, admin.token);
  assert.equal(del.body.data.adminDeleteUser, true);
  const afterDelete = await callApi('query($id:ID!){ user(id:$id){ id } }', { id: kid.userId }, admin.token);
  assert.equal(afterDelete.body.data.user, null);

  await kid.cleanup();
});

test('users query and adminUpdateUser/adminDeleteUser mutations reject a student token', async () => {
  const list = await callApi('{ users { id } }', undefined, student.token);
  assert.match(list.body.errors[0].message, /Admin only/);

  const update = await callApi('mutation($id:ID!){ adminUpdateUser(id:$id, coins:1){ id } }', { id: student.userId }, student.token);
  assert.match(update.body.errors[0].message, /Admin only/);

  const del = await callApi('mutation($id:ID!){ adminDeleteUser(id:$id) }', { id: student.userId }, student.token);
  assert.match(del.body.errors[0].message, /Admin only/);
});

test('reports: file as a user, see and resolve as admin', async () => {
  const filed = await callApi(
    'mutation($userId:ID,$reason:String){ reportUser(userId:$userId, reason:$reason) }',
    { userId: student.userId, reason: 'unit-test-report' },
    student.token
  );
  assert.equal(filed.body.data.reportUser, true);

  const list = await callApi('{ reports { id reason status } }', undefined, admin.token);
  const mine = list.body.data.reports.find((r: any) => r.reason === 'unit-test-report');
  assert.ok(mine);

  const resolve = await callApi('mutation($id:ID!){ resolveReport(id:$id){ status } }', { id: mine.id }, admin.token);
  assert.equal(resolve.body.data.resolveReport.status, 'resolved');
});
