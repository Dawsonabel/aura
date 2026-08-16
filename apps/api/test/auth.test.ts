/* Not a port of the old auth.test.js — that suite tested server.js's own OTP/session machinery
   (rate-limited SMS codes, lockout after wrong attempts), which no longer exists: Clerk owns all
   of that now, untested here for the same reason server.js's crypto internals were never tested
   directly. What we still own and need to verify is requireMe/requireAdmin actually gating the
   right resolvers — that's this file's scope. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDb, callApi, createTestUser, type TestUser } from './helpers';

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

test('public queries work with no token at all', async () => {
  const r = await callApi('{ schools { id } pollLibrary { emoji } }');
  assert.equal(r.body.errors, undefined);
});

test('student-gated queries reject no token', async () => {
  const r = await callApi('{ me { id } }');
  assert.match(r.body.errors[0].message, /Not logged in/);
});

test('student-gated queries succeed with a student token', async () => {
  const r = await callApi('{ me { id } }', undefined, student.token);
  assert.equal(r.body.data.me.id, student.userId);
});

test('admin-gated queries reject no token and a student token, succeed with an admin token', async () => {
  const query = 'query($id:ID!){ user(id:$id){ id } }';
  const vars = { id: student.userId };

  const noToken = await callApi(query, vars);
  assert.match(noToken.body.errors[0].message, /Admin only/);

  const studentToken = await callApi(query, vars, student.token);
  assert.match(studentToken.body.errors[0].message, /Admin only/);

  const adminToken = await callApi(query, vars, admin.token);
  assert.equal(adminToken.body.data.user.id, student.userId);
});

test('admin-gated mutations reject a student token', async () => {
  const r = await callApi('mutation($name:String!){ createSchool(name:$name){ id } }', { name: 'Nope High' }, student.token);
  assert.match(r.body.errors[0].message, /Admin only/);
});
