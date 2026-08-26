/* The admin tuning page's server half: dials are listed, set, cleared — and, the part that matters,
   a set dial changes what the game actually serves. Black-box like everything else here: the assert
   on an override is made through pollRound, not by reading the table back. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDb, callApi, cleanupAll, createTestUser, joinSchool, seedPolls, type TestUser } from './helpers';

let admin: TestUser, student: TestUser;

const DIALS = '{ tuningDials { key value default overridden } }';
const SET = 'mutation($k:String!,$v:Int){ updateTuningDial(key:$k, value:$v){ key value default overridden } }';

before(async () => {
  await resetDb();
  admin = await createTestUser({ admin: true });
  student = await createTestUser();
  const school = await callApi('mutation($name:String!){ createSchool(name:$name){ id } }', { name: 'Dials High' }, admin.token);
  await joinSchool(student.token, school.body.data.createSchool.id);
  await seedPolls(admin.token, 4);
});
after(async () => {
  await cleanupAll(admin, student);
});

test('the dial list is admin-only, in both directions', async () => {
  const anon = await callApi(DIALS);
  assert.match(anon.body.errors[0].message, /Admin only/);
  const asStudent = await callApi(DIALS, undefined, student.token);
  assert.match(asStudent.body.errors[0].message, /Admin only/);
  const set = await callApi(SET, { k: 'rerollCost', v: 9 }, student.token);
  assert.match(set.body.errors[0].message, /Admin only/);
});

test('every dial arrives with its default and starts unoverridden', async () => {
  const r = await callApi(DIALS, undefined, admin.token);
  const dials = r.body.data.tuningDials;
  const reroll = dials.find((d: any) => d.key === 'rerollCost');
  assert.ok(reroll, 'rerollCost is listed');
  assert.equal(reroll.value, reroll.default, 'no override yet, value is the default');
  assert.equal(dials.some((d: any) => d.overridden), false);
});

test('setting a dial changes what the game serves, and clearing it puts it back', async () => {
  const before_ = await callApi('{ pollRound { rerollCost } }', undefined, student.token);
  const shipped = before_.body.data.pollRound.rerollCost;

  const set = await callApi(SET, { k: 'rerollCost', v: shipped + 7 }, admin.token);
  const row = set.body.data.updateTuningDial.find((d: any) => d.key === 'rerollCost');
  assert.equal(row.value, shipped + 7);
  assert.equal(row.overridden, true);

  /* The assert that matters: the *game* changed, not just the admin page's mirror of it. pollRound
     resumes an unfinished round but `meta` (rerollCost included) is rebuilt per request from
     ctx.tuning, so the same round reports the new price. */
  const after_ = await callApi('{ pollRound { rerollCost } }', undefined, student.token);
  assert.equal(after_.body.data.pollRound.rerollCost, shipped + 7);

  const cleared = await callApi(SET, { k: 'rerollCost' }, admin.token);
  assert.equal(cleared.body.data.updateTuningDial.find((d: any) => d.key === 'rerollCost').overridden, false);
  const restored = await callApi('{ pollRound { rerollCost } }', undefined, student.token);
  assert.equal(restored.body.data.pollRound.rerollCost, shipped);
});

test('garbage is refused loudly: unknown keys and negative values never reach the table', async () => {
  const badKey = await callApi(SET, { k: 'freeMoney', v: 1 }, admin.token);
  assert.match(badKey.body.errors[0].message, /Unknown dial/);
  const negative = await callApi(SET, { k: 'rerollCost', v: -5 }, admin.token);
  assert.match(negative.body.errors[0].message, /whole numbers/);
  // And nothing changed for players.
  const r = await callApi(DIALS, undefined, admin.token);
  assert.equal(r.body.data.tuningDials.some((d: any) => d.overridden), false);
});
