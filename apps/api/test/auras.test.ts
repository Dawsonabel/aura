import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { neon } from '@neondatabase/serverless';
import { resetDb, callApi, createTestUser, env, joinSchool, seedPolls, seedVotes, type TestUser } from './helpers';

let admin: TestUser;
let schoolId: string;
const cleanupList: TestUser[] = [];

before(async () => {
  await resetDb();
  admin = await createTestUser({ admin: true });
  const school = await callApi('mutation($name:String!){ createSchool(name:$name){ id } }', { name: 'Auras High' }, admin.token);
  schoolId = school.body.data.createSchool.id;
  /* 12, not 4. A round contains every enabled poll (capped at questionsPerRound, currently 10), and
     rounds resume now — so with only 4 seeded, a voter could cast at most 4 votes across this whole
     file before voteTwice ran out of unanswered questions. The board test already used exactly 4 with
     a single voter, i.e. it sat on the boundary. More polls decouples the tests from each other's
     vote counts; seeding above the cap is harmless. */
  await seedPolls(admin.token, 12);
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

/* Two auras from one voter at one target, seeded directly (see seedVotes in helpers) rather than
   played through a round. It used to walk the voter's real round voting for `targetId` — but the vote
   mutation only accepts a target the round actually served, and in this file's growing shared school
   whether a specific person lands in a question's four weighted-random choices is a dice roll. These
   tests are about what the votes *become* (cards, counts, flips, boards); whether a vote is accepted
   is voting.test.ts's job. */
async function voteTwice(voter: TestUser, targetId: string): Promise<void> {
  await seedVotes(voter.userId, targetId, 2);
}

const AURAS_QUERY = '{ auras { auras { id repeatAdmirer unread infiniteAura } coins infiniteAura } }';

/* The clue-ladder tests lived here — five of them, covering the grade tile's price, the one-free-
   tile-a-day rule, a member scratching for nothing, an unknown clue name, and the coin-bought first
   initial. The ladder is gone: coins buy boosts and rerolls, and the only way to open a card is a
   flip. What replaced those tests is the flip-allowance block below.

   `dailyFlips` defaults to 2 (tuning.ts). These read `flipsLeft`/`flipsPerDay` off the query rather
   than assuming the number, so retuning the dial doesn't break them — what they pin is the *shape*:
   the allowance counts down per card, refuses at zero, is never charged twice for the same card, and
   is never charged at all for a card that couldn't open. */
const FLIP_MUTATION = 'mutation($id:ID!){ revealAuraName(id:$id){ name flipsLeft } }';
const FLIP_QUERY = '{ auras { auras { id name grade } flipsLeft flipsPerDay infiniteAura } }';

/* The sender's own membership outranks the viewer's, and outranks a flip already spent.

   Anonymity has to be retroactive or it isn't a promise: someone can flip your card and *then* you
   sign up for Infinite Aura. The payload is recomputed per request off the sender's current state, so
   the name goes back in the envelope — and the card refuses to open again at any price. */
test('a sender who becomes anonymous takes back a name that was already flipped', async () => {
  const voter = await makeSchoolUser();
  await callApi('mutation{ updateMe(firstName:"Nina", grade:"9"){ id } }', undefined, voter.token);
  const target = await makeSchoolUser();
  await callApi('mutation{ legacyInfiniteAura }', undefined, target.token);
  await voteTwice(voter, target.userId);

  const aura = (await callApi(FLIP_QUERY, undefined, target.token)).body.data.auras.auras[0];
  // Face down and the grade is already there — it's free, like the gender. Only the name is bought.
  assert.equal(aura.name, null);
  assert.equal(aura.grade, '9', 'the grade is free on a face-down card');

  await callApi(FLIP_MUTATION, { id: aura.id }, target.token);
  const bought = (await callApi(FLIP_QUERY, undefined, target.token)).body.data.auras.auras.find(
    (f: { id: string }) => f.id === aura.id
  );
  // Substring, not equality: createTestUser's surname is a fixture detail this test shouldn't pin.
  assert.match(bought.name, /Nina/);

  // The sender signs up, after the fact.
  await callApi('mutation{ legacyInfiniteAura }', undefined, voter.token);

  const hidden = (await callApi(FLIP_QUERY, undefined, target.token)).body.data.auras.auras.find(
    (f: { id: string }) => f.id === aura.id
  );
  assert.equal(hidden.name, null, "an anonymous sender's name is withheld even from a member");
  /* The grade stays — anonymity takes back the *name*, which is the thing the sender's own membership
     hides. Their grade is free on every other card in the grid, so withholding it here would say
     something about this sender that the rest of the school doesn't have said about them. */
  assert.equal(hidden.grade, '9');
});

test('an anonymous (Infinite Aura) admirer cannot be flipped', async () => {
  const voter = await makeSchoolUser();
  await callApi('mutation{ legacyInfiniteAura }', undefined, voter.token);
  const target = await makeSchoolUser();
  await callApi('mutation{ legacyInfiniteAura }', undefined, target.token);
  await voteTwice(voter, target.userId);
  const auras = await callApi(FLIP_QUERY, undefined, target.token);
  const r = await callApi(FLIP_MUTATION, { id: auras.body.data.auras.auras[0].id }, target.token);
  assert.match(r.body.errors[0].message, /anonymous/);

  // Refused, and not billed for — the protected screen's "nothing spent" has to be true.
  const after = await callApi(FLIP_QUERY, undefined, target.token);
  assert.equal(after.body.data.auras.flipsLeft, auras.body.data.auras.flipsPerDay);
});

test('reveal-name requires Infinite Aura on the target', async () => {
  const voter = await makeSchoolUser();
  const target = await makeSchoolUser();
  await voteTwice(voter, target.userId);
  const auras = await callApi(AURAS_QUERY, undefined, target.token);
  const r = await callApi('mutation($id:ID!){ revealAuraName(id:$id){ name } }', { id: auras.body.data.auras.auras[0].id }, target.token);
  assert.match(r.body.errors[0].message, /Infinite Aura required/);
});

/* 15A removed the "picked you twice" precondition on a reveal; that stays gone — a single pick is a
   card like any other, and this test fails if the old requirement creeps back. What did *not* stay gone
   is a limit: the flip allowance below replaces the old weekly cap with a daily one. */
test('reveal-name works on a single pick, not just a repeat admirer', async () => {
  const voter = await makeSchoolUser();
  const target = await makeSchoolUser();
  await callApi('mutation{ legacyInfiniteAura }', undefined, target.token);
  await seedVotes(voter.userId, target.userId, 1); // exactly one pick — the single card under test
  const auras = await callApi(AURAS_QUERY, undefined, target.token);
  const reveal = await callApi('mutation($id:ID!){ revealAuraName(id:$id){ name } }', { id: auras.body.data.auras.auras[0].id }, target.token);
  assert.ok(!reveal.body.errors, `a single pick should reveal: ${JSON.stringify(reveal.body.errors)}`);
  assert.ok(reveal.body.data.revealAuraName.name.length > 0);
});

test('a flip opens one card, not every card from that sender', async () => {
  const voter = await makeSchoolUser();
  const target = await makeSchoolUser();
  await callApi('mutation{ legacyInfiniteAura }', undefined, target.token);
  await voteTwice(voter, target.userId); // one person, two picks, two cards

  const before = await callApi(FLIP_QUERY, undefined, target.token);
  assert.equal(before.body.data.auras.auras.length, 2);

  const reveal = await callApi(FLIP_MUTATION, { id: before.body.data.auras.auras[0].id }, target.token);
  assert.ok(!reveal.body.errors, JSON.stringify(reveal.body.errors));

  /* The whole point of moving the name from the person to the card: the sibling card stays face down.
     Under the old per-voter rule both of these came back named for one flip. */
  const after = await callApi(FLIP_QUERY, undefined, target.token);
  const named = after.body.data.auras.auras.filter((f: { name: string | null }) => f.name);
  assert.equal(named.length, 1, 'flipping one card must not open the sender’s other cards');
  assert.equal(named[0].id, before.body.data.auras.auras[0].id);
});

test('a member gets flipsPerDay flips a day, and the next one is refused', async () => {
  const target = await makeSchoolUser();
  await callApi('mutation{ legacyInfiniteAura }', undefined, target.token);
  for (let i = 0; i < 3; i++) {
    const voter = await makeSchoolUser();
    await voteTwice(voter, target.userId);
  }
  const auras = await callApi(FLIP_QUERY, undefined, target.token);
  const cards = auras.body.data.auras.auras;
  assert.equal(cards.length, 6); // 3 admirers x 2 picks each
  const allowance = auras.body.data.auras.flipsPerDay;
  assert.equal(auras.body.data.auras.flipsLeft, allowance, 'a fresh member starts the day with a full allowance');

  for (let i = 0; i < allowance; i++) {
    const r = await callApi(FLIP_MUTATION, { id: cards[i].id }, target.token);
    assert.ok(!r.body.errors, `flip ${i + 1} of ${allowance} should be allowed: ${JSON.stringify(r.body.errors)}`);
    assert.equal(r.body.data.revealAuraName.flipsLeft, allowance - i - 1);
  }

  const overdrawn = await callApi(FLIP_MUTATION, { id: cards[allowance].id }, target.token);
  assert.ok(overdrawn.body.errors, 'the flip past the allowance must be refused');
  assert.match(overdrawn.body.errors[0].message, /reset at midnight/);

  // Refused means refused: the card it was spent on stays shut.
  const after = await callApi(FLIP_QUERY, undefined, target.token);
  const named = after.body.data.auras.auras.filter((f: { name: string | null }) => f.name);
  assert.equal(named.length, allowance);
  assert.equal(after.body.data.auras.flipsLeft, 0);
});

test('re-flipping an already-open card costs nothing', async () => {
  const voter = await makeSchoolUser();
  const target = await makeSchoolUser();
  await callApi('mutation{ legacyInfiniteAura }', undefined, target.token);
  await voteTwice(voter, target.userId);

  const auras = await callApi(FLIP_QUERY, undefined, target.token);
  const id = auras.body.data.auras.auras[0].id;
  const first = await callApi(FLIP_MUTATION, { id }, target.token);
  const spent = first.body.data.revealAuraName.flipsLeft;

  /* Reopening the reveal screen re-runs this mutation. Charging for that would drain the day's
     allowance on navigation alone, which is the sort of bug a user reads as theft. */
  const second = await callApi(FLIP_MUTATION, { id }, target.token);
  assert.ok(!second.body.errors, JSON.stringify(second.body.errors));
  assert.equal(second.body.data.revealAuraName.flipsLeft, spent, 'an open card must not cost a second flip');
});

test('a non-member has no flips to spend', async () => {
  const voter = await makeSchoolUser();
  const target = await makeSchoolUser();
  await voteTwice(voter, target.userId);
  const auras = await callApi(FLIP_QUERY, undefined, target.token);
  assert.equal(auras.body.data.auras.infiniteAura, false);
  // Not `flipsPerDay` — the allowance is what the membership buys, so there is nothing counting down.
  assert.equal(auras.body.data.auras.flipsLeft, 0);
});

test('auras/read marks all auras as read', async () => {
  const voter = await makeSchoolUser();
  const target = await makeSchoolUser();
  await voteTwice(voter, target.userId);
  const markRead = await callApi('mutation{ markAurasRead }', undefined, target.token);
  assert.equal(markRead.body.data.markAurasRead, true);
  const auras = await callApi(AURAS_QUERY, undefined, target.token);
  assert.ok(auras.body.data.auras.auras.every((f: any) => f.unread === false));
});

test('blocking hides that admirer’s auras, and unblocking brings them back', async () => {
  const voter = await makeSchoolUser();
  const target = await makeSchoolUser();
  await voteTwice(voter, target.userId);

  const before1 = await callApi(AURAS_QUERY, undefined, target.token);
  assert.equal(before1.body.data.auras.auras.length, 2, 'both auras land before any block');

  // Read-time filter, not a delete — see aurasFor. The blocked list's copy promises exactly this
  // round trip, so the reversibility is the part worth pinning down.
  await callApi('mutation($id:ID!){ block(userId:$id) }', { id: voter.userId }, target.token);
  const blocked = await callApi(AURAS_QUERY, undefined, target.token);
  assert.equal(blocked.body.data.auras.auras.length, 0, 'a blocked admirer’s auras are hidden');

  await callApi('mutation($id:ID!){ unblock(userId:$id) }', { id: voter.userId }, target.token);
  const unblocked = await callApi(AURAS_QUERY, undefined, target.token);
  assert.equal(unblocked.body.data.auras.auras.length, 2, 'unblocking restores them');
});

test('a aura is hidden when the admirer blocks the target, not just the other way round', async () => {
  const voter = await makeSchoolUser();
  const target = await makeSchoolUser();
  await voteTwice(voter, target.userId);

  // notBlocked() is mutual, so this direction has to hide them too.
  await callApi('mutation($id:ID!){ block(userId:$id) }', { id: target.userId }, voter.token);
  const auras = await callApi(AURAS_QUERY, undefined, target.token);
  assert.equal(auras.body.data.auras.auras.length, 0);
});

/** N votes at one explicit timestamp. seedVotes always stamps `now()`, and the tie-break is all ts. */
async function seedVotesAt(voterId: string, targetId: string, count: number, tsIso: string): Promise<void> {
  const sql = neon(env.DATABASE_URL as string);
  const polls = await sql`SELECT id, emoji, text, color FROM polls WHERE enabled ORDER BY created_at LIMIT ${count}`;
  if (polls.length < count) throw new Error(`seedVotesAt: need ${count} enabled polls, found ${polls.length}`);
  for (const p of polls) {
    await sql`
      INSERT INTO votes (id, voter_id, target_id, question_id, emoji, text, color, ts)
      VALUES (${'vote_' + crypto.randomUUID().slice(0, 12)}, ${voterId}, ${targetId}, ${p.id}, ${p.emoji}, ${p.text}, ${p.color}, ${tsIso})
    `;
  }
}
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

const BOARD_QUERY = `
  query($scope: String) {
    board(scope: $scope) {
      resetsAt
      aurasToTopTen
      entries { rank userId name grade auras blocked }
      me { rank auras }
    }
  }
`;

/* Equal scores are common on a weekly board — this school has a whole pack tied on two — so *how* a
   tie breaks is real behaviour, not an edge case. It used to fall out of target_id, which is to say
   out of nothing. Now the earlier arrival wins, and this pins that. */
test('a tie breaks toward whoever reached the score first', async () => {
  const early = await makeSchoolUser();
  const late = await makeSchoolUser();
  const voter = await makeSchoolUser();

  /* Identical counts, six hours apart. `late` is created *after* `early`, so if the ordering were
     still falling back to the id this would come out the other way round — which is what makes this
     a test of the tie-break rather than of insertion order. */
  await seedVotesAt(voter.userId, early.userId, 11, hoursAgo(7));
  await seedVotesAt(voter.userId, late.userId, 11, hoursAgo(1));

  const board = await callApi(BOARD_QUERY, { scope: 'overall' }, early.token);
  const entries = board.body.data.board.entries;
  const earlyRow = entries.find((e: any) => e.userId === early.userId);
  const lateRow = entries.find((e: any) => e.userId === late.userId);

  assert.ok(earlyRow && lateRow, 'both are on the board');
  assert.equal(earlyRow.auras, lateRow.auras, 'the scores really are tied');
  assert.ok(earlyRow.rank < lateRow.rank, 'holding the score longer wins the tie');
});

test('the board ranks by auras received and pins your own row', async () => {
  const top = await makeSchoolUser();
  const mid = await makeSchoolUser();
  const voterA = await makeSchoolUser();
  const voterB = await makeSchoolUser();
  await callApi('mutation{ updateMe(firstName:"Top", lastName:"Scorer"){ id } }', undefined, top.token);

  /* Two admirers for `top`, one for `mid` — so the ordering is unambiguous. Scaled well past two
     auras each, and for the same reason the blocked-row test below is: `boardLimit` is 10 and this
     file's shared school accumulates a two-aura target per test, so at two these tie that whole pack
     and drop off the payload. `entries.find` would return undefined and the ordering assertions would
     have nothing to read. seedVotes needs a distinct poll per vote, so 12 is the per-voter ceiling —
     hence 24 for `top` across two voters against 10 for `mid`. */
  await seedVotes(voterA.userId, top.userId, 12);
  await seedVotes(voterB.userId, top.userId, 12);
  await seedVotes(voterA.userId, mid.userId, 10);

  const board = await callApi(BOARD_QUERY, { scope: 'overall' }, top.token);
  const entries = board.body.data.board.entries;

  /* Relative, not absolute: every test in this file shares one school, so earlier tests have already
     put their own targets on this board — asserting rank 1 here just measures test ordering. What
     matters is that more auras means a better rank, and that ranks ascend with the list. */
  const topRow = entries.find((e: any) => e.userId === top.userId);
  const midRow = entries.find((e: any) => e.userId === mid.userId);
  assert.ok(topRow && midRow, 'both targets appear on the board');
  assert.ok(topRow.auras > midRow.auras, 'more auras is more auras');
  assert.ok(topRow.rank < midRow.rank, 'more auras means a lower rank number');
  assert.equal(topRow.name, 'Top Scorer', 'unblocked rows carry the real name');
  assert.deepEqual(
    entries.map((e: any) => e.rank),
    entries.map((_: any, i: number) => i + 1),
    'ranks are 1..n in list order'
  );

  // The pinned row is the caller's own, wherever they placed.
  assert.equal(board.body.data.board.me.rank, topRow.rank);
  assert.equal(board.body.data.board.me.auras, topRow.auras);
  assert.ok(Date.parse(board.body.data.board.resetsAt) > Date.now(), 'resetsAt is in the future');
});

test('a blocked person keeps their rank and score on the board but loses their name', async () => {
  const viewer = await makeSchoolUser();
  const rival = await makeSchoolUser();
  const voter = await makeSchoolUser();
  await callApi('mutation{ updateMe(firstName:"Rival", lastName:"Person"){ id } }', undefined, rival.token);
  /* 12, not the usual 2, and the count is load-bearing.

     `boardLimit` is 10, and this file's shared school accumulates a target with two auras per test —
     sixteen of them by the end. At two the rival ties that whole pack and lands wherever the id
     tiebreak puts them, which since the limit dropped from 25 to 10 is usually off the board entirely,
     and `entries.find` returns undefined before this test can assert anything about masking.

     Twelve (one per enabled poll — seedVotes needs a distinct poll per vote) puts them clearly first,
     so what's under test here stays masking rather than ranking. */
  await seedVotes(voter.userId, rival.userId, 12);

  const before1 = await callApi(BOARD_QUERY, { scope: 'overall' }, viewer.token);
  const rivalBefore = before1.body.data.board.entries.find((e: any) => e.userId === rival.userId);
  assert.equal(rivalBefore.name, 'Rival Person');
  assert.equal(rivalBefore.blocked, false);

  await callApi('mutation($id:ID!){ block(userId:$id) }', { id: rival.userId }, viewer.token);

  const after1 = await callApi(BOARD_QUERY, { scope: 'overall' }, viewer.token);
  const rivalAfter = after1.body.data.board.entries.find((e: any) => e.userId === rival.userId);
  // 8A: rank and score stay true, identity does not. Still listed — never silently dropped.
  assert.ok(rivalAfter, 'a blocked person is still on the board');
  assert.equal(rivalAfter.blocked, true);
  assert.equal(rivalAfter.name, 'Blocked');
  assert.equal(rivalAfter.grade, null, 'grade is masked with the name');
  assert.equal(rivalAfter.rank, rivalBefore.rank, 'rank is unchanged by blocking');
  assert.equal(rivalAfter.auras, rivalBefore.auras, 'score is unchanged by blocking');
});

const BOARD_QUERY_LOCK = `
  query($scope: String) {
    board(scope: $scope) {
      unlocked
      memberCount
      unlockThreshold
      entries { rank userId }
      me { rank }
    }
  }
`;

test('the board is locked until the school reaches the unlock threshold', async () => {
  /* Its own school, not the shared "Auras High": every test in this file adds users to that one, so
     by now it is well past the threshold and asserting "locked" there would just be asserting how
     many tests ran before this one.

     And its own admin: `admin.token` was minted in before(), Clerk session JWTs expire after about a
     minute, and this file takes minutes to run — so the shared token is long dead by the time a test
     this far down uses it. (It fails as `data: null` rather than an auth error, which is a confusing
     way to learn this.) */
  const freshAdmin = await createTestUser({ admin: true });
  cleanupList.push(freshAdmin);
  const small = await callApi(
    'mutation($name:String!){ createSchool(name:$name){ id } }',
    { name: 'Tiny High ' + Date.now() },
    freshAdmin.token
  );
  const viewer = await createTestUser();
  cleanupList.push(viewer);
  await joinSchool(viewer.token, small.body.data.createSchool.id);

  const board = await callApi(BOARD_QUERY_LOCK, { scope: 'overall' }, viewer.token);
  const b = board.body.data.board;

  assert.equal(b.unlocked, false, 'a small school starts locked');
  assert.equal(b.unlockThreshold, 20);
  assert.ok(b.memberCount > 0 && b.memberCount < b.unlockThreshold);
  /* The standings are withheld server-side, not merely hidden by the client — otherwise anyone
     reading the network response would see the very ranking the lock exists to suppress. */
  assert.deepEqual(b.entries, [], 'no rows are sent while locked');
  assert.equal(b.me, null);
});

const COHORT_QUERY = '{ auras { auras { gender grade detailHidden } } }';

/* Gender *and* grade are free on every card — the anonymity floor is off by default (cohortFloor: 0).

   This is the case the floor was written for: a cohort of exactly one, which is as identifying as it
   gets. Both attributes come through anyway, because "a girl in 11th grade" is the line the product
   uses to describe what a pick tells you, and a school large enough not to set the floor is a school
   where that line names a crowd. If someone reinstates the floor by default, this test says so. */
test("a face-down card shows the sender's gender and grade even when their cohort is tiny", async () => {
  const voter = await makeSchoolUser();
  const target = await makeSchoolUser();
  // Nobody else in this test school is a nonbinary 12th-grader, so the cohort size is 1.
  await callApi('mutation{ updateMe(gender:"nonbinary", grade:"12"){ id } }', undefined, voter.token);
  await voteTwice(voter, target.userId);

  const auras = await callApi(COHORT_QUERY, undefined, target.token);
  /* Checked before indexing so a future failure says "no auras arrived" instead of dying on
     `undefined.detailHidden` — this test failed once in CI in exactly that unhelpful way and the cause
     could not be read from the output. */
  const list = auras.body.data.auras.auras;
  assert.equal(list.length, 2, 'both votes should have landed as auras');
  const f = list[0];
  assert.equal(f.detailHidden, false, 'the floor is off by default');
  assert.equal(f.gender, 'nonbinary');
  assert.equal(f.grade, '12', 'the grade is free on a face-down card, same as the gender');
});

/* The floor still works when a school turns it on. Kept because the mechanism is deliberately wired
   up rather than deleted — a school small enough to need it can set AURA_COHORT_FLOOR, and this is
   what proves that switch is real and not a dead config key. */
test('raising AURA_COHORT_FLOOR puts the gender and grade back in the envelope', async () => {
  const voter = await makeSchoolUser();
  const target = await makeSchoolUser();
  await callApi('mutation{ updateMe(gender:"nonbinary", grade:"12"){ id } }', undefined, voter.token);
  await voteTwice(voter, target.userId);

  (env as Record<string, unknown>).AURA_COHORT_FLOOR = '5';
  try {
    const auras = await callApi(COHORT_QUERY, undefined, target.token);
    const f = auras.body.data.auras.auras[0];
    assert.equal(f.detailHidden, true, 'a cohort of one is below a floor of five');
    // Blanked in the payload too, so a client that ignores the flag still cannot leak them.
    assert.equal(f.gender, 'private');
    assert.equal(f.grade, '', 'the floor covers the pair, not just the gender');
  } finally {
    // Restored even on failure — `env` is shared by every test in the file.
    delete (env as Record<string, unknown>).AURA_COHORT_FLOOR;
  }
});

const PUBLIC_PROFILE_QUERY_T = `
  query($userId: ID!) {
    publicProfile(userId: $userId) {
      name username blocked auras rank
      superlatives { text count }
      socials { instagram }
    }
  }
`;

test('handles are unique: taken ones are rejected on write and reported unavailable', async () => {
  const owner = await makeSchoolUser();
  const other = await makeSchoolUser();
  const handle = 'takenhandle' + Math.floor(Math.random() * 100000);

  await callApi('mutation($u:String!){ updateMe(username:$u){ id } }', { u: handle }, owner.token);

  // Your own handle stays "available" to you, so re-saving an unchanged form can't fail.
  const forOwner = await callApi('query($u:String!){ usernameAvailable(username:$u) }', { u: handle }, owner.token);
  assert.equal(forOwner.body.data.usernameAvailable, true);

  const forOther = await callApi('query($u:String!){ usernameAvailable(username:$u) }', { u: handle }, other.token);
  assert.equal(forOther.body.data.usernameAvailable, false);

  /* Enforced on write too, not just advertised by the check — otherwise two people racing the same
     handle would both be told "free" and both succeed. There is no DB constraint to fall back on:
     username lives inside the JSONB blob. */
  const taken = await callApi('mutation($u:String!){ updateMe(username:$u){ id } }', { u: handle.toUpperCase() }, other.token);
  assert.match(taken.body.errors[0].message, /taken/i);
});

test('superlatives aggregate a target’s auras per prompt, most-picked first', async () => {
  const target = await makeSchoolUser();
  const voterA = await makeSchoolUser();
  const voterB = await makeSchoolUser();

  /* Seeded rather than played, like the rest of the aggregation tests — what's under test is how
     `mySuperlatives` groups and orders existing votes, not whether a vote is accepted.

     The split is what makes the ordering assertion real. seedVotes walks enabled polls in creation
     order, so voterA's two votes land on prompts 1 and 2 and voterB's single vote lands on prompt 1
     again: one prompt with two picks, one with a single pick. Two voters share a prompt (aggregation
     counts people, not just rows) and the two prompts have different totals (so "most-picked first"
     has something to actually sort). Both facts are fixed by construction — no round composition
     involved, so there's nothing here to flake. */
  await seedVotes(voterA.userId, target.userId, 2);
  await seedVotes(voterB.userId, target.userId, 1);

  const r = await callApi('{ mySuperlatives { text count } }', undefined, target.token);
  const chips = r.body.data.mySuperlatives;
  assert.equal(chips.length, 2, 'two distinct prompts, so two chips');
  assert.equal(chips[0].count, 2, 'the shared prompt counts both voters');
  assert.equal(chips[1].count, 1);

  /* Ordering is by count desc, which is what puts the biggest trophy first on Profile. This used to
     compare a one-element list against itself, which is true for any list — it only means something
     now that the counts above actually differ. */
  assert.deepEqual(
    chips.map((c: { count: number }) => c.count),
    [2, 1]
  );
});

test('a public profile is same-school only, and never exposes a blocked person', async () => {
  const viewer = await makeSchoolUser();
  const mate = await makeSchoolUser();
  await callApi('mutation{ updateMe(firstName:"Mate", lastName:"Person", username:"matep"){ id } }', undefined, mate.token);

  const ok = await callApi(PUBLIC_PROFILE_QUERY_T, { userId: mate.userId }, viewer.token);
  assert.equal(ok.body.data.publicProfile.name, 'Mate Person');
  assert.equal(ok.body.data.publicProfile.username, 'matep');

  // Someone at another school is simply not visible — null rather than an error, which would itself
  // confirm the account exists.
  const outsider = await createTestUser();
  cleanupList.push(outsider);
  const hidden = await callApi(PUBLIC_PROFILE_QUERY_T, { userId: outsider.userId }, viewer.token);
  assert.equal(hidden.body.data.publicProfile, null);

  await callApi('mutation($id:ID!){ block(userId:$id) }', { id: mate.userId }, viewer.token);
  const blocked = await callApi(PUBLIC_PROFILE_QUERY_T, { userId: mate.userId }, viewer.token);
  assert.equal(blocked.body.data.publicProfile.blocked, true);
  assert.equal(blocked.body.data.publicProfile.name, 'Blocked');
  assert.equal(blocked.body.data.publicProfile.username, null, 'handle is withheld with the name');
  assert.deepEqual(blocked.body.data.publicProfile.superlatives, []);
});

/* The hourly allowance. Three things worth pinning, and all three used to be about a *day*:

   The round is 10 questions, spending it is what refuses the next one, and — the one that actually
   catches regressions — merely *looking* at the Vote tab must not spend it. That last rule is why
   rounds are resumable at all: before they were, every mount built a fresh round, so any limit was
   spent by navigating rather than by playing. At one round an hour that bug would cost the whole hour
   on a stray tab tap. */
test('a round is questionsPerRound long, and asking again resumes it rather than spending another', async () => {
  const player = await makeSchoolUser();

  const first = await callApi('{ pollRound { roundId polls { questionId } roundsLeft roundsPerHour } }', undefined, player.token);
  const round = first.body.data.pollRound;
  assert.equal(round.roundsPerHour, 1, 'one round an hour by default');
  assert.equal(round.polls.length, 10, 'ten questions to a round');
  assert.equal(round.roundsLeft, 0, 'starting it spends the hour’s allowance');

  // Same round back, not a new one, and no further charge.
  const again = await callApi('{ pollRound { roundId polls { questionId } roundsLeft } }', undefined, player.token);
  assert.equal(again.body.data.pollRound.roundId, round.roundId, 'the unfinished round resumes');
  assert.equal(again.body.data.pollRound.polls.length, 10);
});

test('a second round in the same hour is refused, and says when the next one lands', async () => {
  const player = await makeSchoolUser();

  const first = await callApi('{ pollRound { roundId polls { questionId choices { id } } } }', undefined, player.token);
  const { roundId, polls } = first.body.data.pollRound;
  /* Deliberately NOT seedVotes, unlike the aggregation tests above. Round progress lives in Redis and
     only the real mutation writes it, so seeded rows would leave the round unfinished and resumable —
     the opposite of the "spent" state this test exists to reach. Each vote goes to whoever that
     question actually served, since a vote for an unserved target is rejected. */
  for (const p of polls) {
    const vote = await callApi(
      'mutation($q:ID!,$t:ID!,$r:ID!){ vote(questionId:$q, targetId:$t, roundId:$r){ ok } }',
      { q: p.questionId, t: p.choices[0].id, r: roundId },
      player.token
    );
    assert.equal(vote.body.data.vote.ok, true);
  }
  await callApi('mutation($r:ID!){ completeRound(roundId:$r){ earned } }', { r: roundId }, player.token);

  const second = await callApi('{ pollRound { roundId canPlay polls { questionId } roundsLeft nextRoundAt } }', undefined, player.token);
  const out = second.body.data.pollRound;
  assert.equal(out.canPlay, false, 'the round is spent for this hour');
  assert.equal(out.polls.length, 0);
  assert.equal(out.roundsLeft, 0);
  /* The refill lands on a clock hour, not an hour from now — a fixed boundary is learnable and can't
     be shifted by timing when you start. */
  assert.match(out.nextRoundAt, /T\d\d:00:00\.000Z$/);
});

/* Two rounds for one player, which the real allowance (one an hour) won't give — so the dial goes up
   for this test. What's under test is that the *streak* counts days rather than rounds, and that only
   stays checkable if a second round is obtainable at all. */
test('completing a round advances the streak once per day', async () => {
  (env as Record<string, unknown>).AURA_ROUNDS_PER_HOUR = '5';
  try {
  const player = await makeSchoolUser();

  const before1 = await callApi('{ me { streak } }', undefined, player.token);
  assert.equal(before1.body.data.me.streak, 0, 'a new account has no streak');

  /* Real votes, not seedVotes: completeRound is what advances the streak, and it reads round progress
     from Redis — which only the vote mutation writes. The target is whoever the round actually served,
     since a vote for an unserved target is rejected; who receives the aura is irrelevant here. */
  const round = await callApi('{ pollRound { roundId polls { questionId choices { id } } } }', undefined, player.token);
  const roundId = round.body.data.pollRound.roundId;
  const q = round.body.data.pollRound.polls[0];
  await callApi(
    'mutation($q:ID!,$t:ID!,$r:ID!){ vote(questionId:$q, targetId:$t, roundId:$r){ ok } }',
    { q: q.questionId, t: q.choices[0].id, r: roundId },
    player.token
  );
  await callApi('mutation($r:ID!){ completeRound(roundId:$r){ earned } }', { r: roundId }, player.token);

  const after1 = await callApi('{ me { streak } }', undefined, player.token);
  assert.equal(after1.body.data.me.streak, 1);

  /* A second completed round on the same day must not advance it — the aura counts days played, not
     rounds. completeRound is idempotent per round, so this plays a fresh one. */
  const round2 = await callApi('{ pollRound { roundId polls { questionId choices { id } } } }', undefined, player.token);
  const roundId2 = round2.body.data.pollRound.roundId;
  const q2 = round2.body.data.pollRound.polls[1];
  await callApi(
    'mutation($q:ID!,$t:ID!,$r:ID!){ vote(questionId:$q, targetId:$t, roundId:$r){ ok } }',
    { q: q2.questionId, t: q2.choices[0].id, r: roundId2 },
    player.token
  );
  await callApi('mutation($r:ID!){ completeRound(roundId:$r){ earned } }', { r: roundId2 }, player.token);

  const after2 = await callApi('{ me { streak } }', undefined, player.token);
  assert.equal(after2.body.data.me.streak, 1, 'still 1 — same day');
  } finally {
    // Restored even on failure — `env` is shared by every test in the file.
    delete (env as Record<string, unknown>).AURA_ROUNDS_PER_HOUR;
  }
});
