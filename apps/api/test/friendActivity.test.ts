import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { neon } from '@neondatabase/serverless';
import { resetDb, callApi, cleanupAll, createTestUser, env, joinSchool, seedPolls, seedVotes, type TestUser } from './helpers';

/* The Activity feed's server half: friendActivity, friendMilestones, schoolPulse, and the
   newestFromSender flag on a card. Grouped here rather than spread over auras.test.ts because they
   share one privacy design (see friendActivityFor in src/auras.ts) and the tests are mostly about
   what must NOT come back: your own vote, a blocked person's, a protected sender's gender.

   Direct SQL is used the same way migrations.test.ts uses it — for states no API call can produce on
   demand (a backdated vote, a friend's streak) — never for the reads under test, which all go through
   the real Worker. */

const sql = neon(env.DATABASE_URL);

let admin: TestUser, me: TestUser, emma: TestUser, leo: TestUser, sam: TestUser;
let pollText: string;

/** Patch a user's JSONB blob directly — streaks and memberships aren't settable through the API. */
async function patchUserData(userId: string, patch: Record<string, unknown>): Promise<void> {
  await sql`UPDATE users SET data = data || ${JSON.stringify(patch)}::jsonb WHERE id = ${userId}`;
}

/** One vote with an explicit timestamp — seedVotes can't backdate, and schoolPulse is all about ts. */
async function seedVoteAt(voterId: string, targetId: string, tsIso: string): Promise<void> {
  const polls = await sql`SELECT id, emoji, text, color FROM polls WHERE enabled ORDER BY created_at LIMIT 1`;
  await sql`
    INSERT INTO votes (id, voter_id, target_id, question_id, emoji, text, color, ts)
    VALUES (${'vote_' + crypto.randomUUID().slice(0, 12)}, ${voterId}, ${targetId}, ${polls[0].id}, ${polls[0].emoji}, ${polls[0].text}, ${polls[0].color}, ${tsIso})
  `;
}

const FEED_QUERY = '{ friendActivity { id ts friendId friendName gender label emoji } }';
const feedFor = async (u: TestUser) =>
  (await callApi(FEED_QUERY, undefined, u.token)).body.data.friendActivity as
    { id: string; ts: string; friendId: string; friendName: string; gender: string; label: string; emoji: string }[];

before(async () => {
  await resetDb();
  admin = await createTestUser({ admin: true });
  me = await createTestUser();
  emma = await createTestUser();
  leo = await createTestUser();
  sam = await createTestUser();

  const school = await callApi('mutation($name:String!){ createSchool(name:$name){ id } }', { name: 'Feed High' }, admin.token);
  const schoolId = school.body.data.createSchool.id;
  for (const u of [me, emma, leo, sam]) await joinSchool(u.token, schoolId);
  await seedPolls(admin.token, 6);
  pollText = (await sql`SELECT text FROM polls WHERE enabled ORDER BY created_at LIMIT 1`)[0].text as string;

  await callApi('mutation($n:String){ updateMe(firstName:$n){ id } }', { n: 'Emma' }, emma.token);
  await callApi('mutation($g:String){ updateMe(gender:$g){ id } }', { g: 'boy' }, leo.token);
  // Sam has a gender on file AND Infinite Aura — the feed must show neither fact.
  await callApi('mutation($g:String){ updateMe(gender:$g){ id } }', { g: 'girl' }, sam.token);
  await patchUserData(sam.userId, { infiniteAura: true });

  // me <-> Emma is the file's one friendship. Leo and Sam are voters, not friends.
  await callApi('mutation($id:ID!){ sendFriendRequest(userId:$id) }', { id: emma.userId }, me.token);
  await callApi('mutation($id:ID!){ acceptFriendRequest(userId:$id) }', { id: me.userId }, emma.token);
});
after(async () => {
  await cleanupAll(admin, me, emma, leo, sam);
});

test("a friend's pick arrives as gender + first name; a non-friend's picks don't arrive at all", async () => {
  await seedVotes(leo.userId, emma.userId, 1);
  await seedVotes(sam.userId, leo.userId, 1); // Leo is not my friend — invisible however he's picked.

  const events = await feedFor(me);
  assert.equal(events.length, 1);
  assert.deepEqual(
    { friendId: events[0].friendId, friendName: events[0].friendName, gender: events[0].gender },
    { friendId: emma.userId, friendName: 'Emma', gender: 'boy' }
  );
});

/* The prompt used to be withheld from friend rows on purpose. Reversing that was a deliberate call, so
   it gets a test: the point is that the prompt arrives *and* the voter stays anonymous, which is the
   pair the reversal was argued on. A future "tighten this back up" edit should have to look here. */
test("a friend row names the prompt, and still doesn't name the voter", async () => {
  const events = await feedFor(me);
  assert.equal(events[0].label, pollText, 'the prompt comes through');
  assert.ok(events[0].emoji, 'and its emoji');
  // Nothing on the event identifies the voter — gender is the only thing said about them.
  assert.deepEqual(Object.keys(events[0]).filter(k => /voter|user|id$/i.test(k)).sort(), ['friendId', 'id']);
});

test('your own vote for a friend is dropped — the one row that could out a voter', async () => {
  await seedVotes(me.userId, emma.userId, 1);
  const events = await feedFor(me);
  // Still only Leo's pick. A "someone gave Emma aura" that is secretly you is not news, it's a leak.
  assert.equal(events.length, 1);
  assert.equal(events[0].gender, 'boy');
});

test('a protected (Infinite Aura) voter reads as private, never by gender', async () => {
  await seedVoteAt(sam.userId, emma.userId, new Date(Date.now() - 60_000).toISOString());
  const events = await feedFor(me);
  const sams = events.filter(e => e.gender === 'private');
  assert.equal(sams.length, 1, "Sam's pick is present but stripped");
  assert.equal(events.some(e => e.gender === 'girl'), false, 'the gender on file must not appear');
});

test('blocking the voter removes their rows second-hand too, and unblocking restores them', async () => {
  await callApi('mutation($id:ID!){ block(userId:$id) }', { id: leo.userId }, me.token);
  const blocked = await feedFor(me);
  assert.equal(blocked.some(e => e.gender === 'boy'), false, "a blocked voter's picks are gone");
  assert.equal(blocked.length, 1, "Sam's private pick survives");

  await callApi('mutation($id:ID!){ unblock(userId:$id) }', { id: leo.userId }, me.token);
  assert.equal((await feedFor(me)).length, 2);
});

test('friendMilestones: a streak needs 3 days and is dated to the day it was played, not to now', async () => {
  await patchUserData(emma.userId, { streak: 2, lastPlayedOn: '2026-08-19' });
  const below = await callApi('{ friendMilestones { kind } }', undefined, me.token);
  assert.equal(below.body.data.friendMilestones.some((m: any) => m.kind === 'streak'), false, 'a 2-day streak is not news');

  await patchUserData(emma.userId, { streak: 5 });
  const r = await callApi('{ friendMilestones { kind count ts friendName } }', undefined, me.token);
  const streak = r.body.data.friendMilestones.find((m: any) => m.kind === 'streak');
  assert.ok(streak, 'a 5-day streak is');
  assert.equal(streak.count, 5);
  assert.equal(streak.friendName, 'Emma');
  // Pinned to midday on the played day, so it can't float to the top of the feed on every refetch.
  assert.equal(streak.ts, '2026-08-19T12:00:00.000Z');
});

test('friendMilestones: a superlative needs 3 wins, and each friend surfaces only their best', async () => {
  /* Emma's votes so far all landed on the first poll: Leo's, mine, and Sam's (seedVotes and seedVoteAt
     both take the oldest enabled poll). That's exactly 3 — the MIN_WINS floor. */
  const r = await callApi('{ friendMilestones { kind count label friendId } }', undefined, me.token);
  const sups = r.body.data.friendMilestones.filter((m: any) => m.kind === 'superlative');
  assert.equal(sups.length, 1, 'one superlative per friend, not a leaderboard');
  assert.equal(sups[0].friendId, emma.userId);
  assert.equal(sups[0].count, 3);
  assert.equal(sups[0].label, pollText);
});

test('schoolPulse buckets by 24-hour window and forgets the day before yesterday', async () => {
  const pulse = async () =>
    (await callApi('{ schoolPulse { today yesterday } }', undefined, me.token)).body.data.schoolPulse;
  const before_ = await pulse();

  await seedVoteAt(leo.userId, sam.userId, new Date(Date.now() - 30 * 3_600_000).toISOString()); // 30h → yesterday
  await seedVoteAt(sam.userId, emma.userId, new Date(Date.now() - 3 * 86_400_000).toISOString()); // 3d → out of frame

  const after_ = await pulse();
  assert.equal(after_.yesterday, before_.yesterday + 1, 'the 30-hour-old vote lands in yesterday');
  assert.equal(after_.today, before_.today, 'the 3-day-old vote lands nowhere');
});

test('newestFromSender marks exactly one card per sender — and none once the sender goes anonymous', async () => {
  await seedVotes(leo.userId, me.userId, 2);
  const AURAS = '{ auras { auras { id ts newestFromSender anonymous } } }';

  const first = (await callApi(AURAS, undefined, me.token)).body.data.auras.auras;
  assert.equal(first.length, 2, 'both of Leo\'s cards arrive');
  const flagged = first.filter((a: any) => a.newestFromSender);
  assert.equal(flagged.length, 1, 'the "N times" line belongs on one card, not repeated per card');
  assert.equal(flagged[0].ts, [...first].map((a: any) => a.ts).sort().at(-1), 'and that card is the newest');

  /* Anonymity is retroactive here the same way it is for names: once Leo has Infinite Aura, no card
     of his may carry a flag whose whole purpose is grouping cards by sender. */
  await patchUserData(leo.userId, { infiniteAura: true });
  const anon = (await callApi(AURAS, undefined, me.token)).body.data.auras.auras;
  assert.equal(anon.every((a: any) => a.anonymous && !a.newestFromSender), true);
});

test('markAuraOpened flips one card, and only for its owner', async () => {
  const AURAS = '{ auras { auras { id opened } } }';
  const cards = (await callApi(AURAS, undefined, me.token)).body.data.auras.auras;
  assert.equal(cards.every((c: any) => !c.opened), true);

  // Emma passing my card id marks nothing — the write is scoped to the caller's own cards.
  await callApi('mutation($id:ID!){ markAuraOpened(id:$id) }', { id: cards[0].id }, emma.token);
  await callApi('mutation($id:ID!){ markAuraOpened(id:$id) }', { id: cards[0].id }, me.token);

  const seen = (await callApi(AURAS, undefined, me.token)).body.data.auras.auras;
  assert.equal(seen.find((c: any) => c.id === cards[0].id)?.opened, true);
  assert.equal(seen.find((c: any) => c.id === cards[1].id)?.opened, false, 'the other card is untouched');
});
