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
  /* 12, not 4. A round contains every enabled poll (capped at 12), and rounds resume now — so with
     only 4 seeded, a voter could cast at most 4 votes across this whole file before voteTwice ran out
     of unanswered questions. The board test already used exactly 4 with a single voter, i.e. it sat on
     the boundary. More polls decouples the tests from each other's vote counts. */
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

/* Casts two votes at one target, walking past questions this voter has already answered.

   It used to just take polls[0] and polls[1], which worked only because every `pollRound` call built a
   brand-new round. Rounds are resumable now (see §9.1), so a second call for the same voter returns the
   *same* round — and voting on the first two questions again is a no-op flagged `dup`, so the target
   silently received nothing. Walking the list keeps each call worth two real flames. */
async function voteTwice(voterToken: string, targetId: string): Promise<void> {
  const r = await callApi('{ pollRound { roundId polls { questionId } } }', undefined, voterToken);
  const roundId = r.body.data.pollRound.roundId;
  const polls: { questionId: string }[] = r.body.data.pollRound.polls;
  let cast = 0;
  for (const poll of polls) {
    if (cast === 2) break;
    const res = await callApi(
      'mutation($q:ID!,$t:ID!,$r:ID!){ vote(questionId:$q, targetId:$t, roundId:$r){ ok dup } }',
      { q: poll.questionId, t: targetId, r: roundId },
      voterToken
    );
    if (res.body.data?.vote?.ok && !res.body.data.vote.dup) cast++;
  }
  if (cast < 2) throw new Error(`voteTwice: only cast ${cast} of 2 votes — round exhausted?`);
}

const FLAMES_QUERY = '{ flames { flames { id initial repeatAdmirer unread godMode } coins godMode } }';

/* 16A's clue ladder. The rules worth pinning: the grade is *not* free any more, the free daily tile is
   spent before coins are, and re-tapping an open tile must never charge twice. Each of those is a way to
   take money we said was free, so each gets a test. */
const LADDER_QUERY = '{ flames { flames { id grade gradeRevealed revealed initial anonymous } coins } shop { freeClueReady clueGradeCost } }';

test('the grade tile is withheld until bought, then charged for once', async () => {
  const voter = await makeSchoolUser();
  await callApi('mutation{ updateMe(firstName:"Gina", grade:"11"){ id } }', undefined, voter.token);
  const target = await makeSchoolUser();
  await voteTwice(voter.token, target.userId);

  const before = await callApi(LADDER_QUERY, undefined, target.token);
  const flame = before.body.data.flames.flames[0];
  // Blanked in the payload, not merely hidden by the client — the tile renders sealed off exactly this.
  assert.equal(flame.gradeRevealed, false);
  assert.equal(flame.grade, '');

  /* A fresh account has the free daily tile available, so the first reveal spends that rather than a
     coin. Burn it on the *other* clue so this test measures the coin path. */
  if (before.body.data.shop.freeClueReady) {
    await callApi('mutation($id:ID!){ revealClue(id:$id, clue:"initial"){ ok usedFreeClue } }', { id: flame.id }, target.token);
  }

  const coinsBefore = (await callApi('{ me { coins } }', undefined, target.token)).body.data.me.coins;
  const cost = before.body.data.shop.clueGradeCost;
  const paid = await callApi('mutation($id:ID!){ revealClue(id:$id, clue:"grade"){ ok coins usedFreeClue } }', { id: flame.id }, target.token);
  assert.ok(!paid.body.errors, JSON.stringify(paid.body.errors));
  assert.equal(paid.body.data.revealClue.usedFreeClue, false);
  assert.equal(paid.body.data.revealClue.coins, coinsBefore - cost);

  const after = await callApi(LADDER_QUERY, undefined, target.token);
  const opened = after.body.data.flames.flames.find((f: { id: string }) => f.id === flame.id);
  assert.equal(opened.gradeRevealed, true);
  assert.equal(opened.grade, '11');

  // Idempotent: tapping an open tile again is free.
  const again = await callApi('mutation($id:ID!){ revealClue(id:$id, clue:"grade"){ coins } }', { id: flame.id }, target.token);
  assert.equal(again.body.data.revealClue.coins, coinsBefore - cost);
});

test('the free daily tile is spent before coins, and only once a day', async () => {
  const voter = await makeSchoolUser();
  await callApi('mutation{ updateMe(firstName:"Fran", grade:"12"){ id } }', undefined, voter.token);
  const target = await makeSchoolUser();
  await voteTwice(voter.token, target.userId);

  const before = await callApi(LADDER_QUERY, undefined, target.token);
  assert.equal(before.body.data.shop.freeClueReady, true, 'a fresh account has not spent its free tile');
  const flame = before.body.data.flames.flames[0];
  const coinsBefore = before.body.data.flames.coins;

  const first = await callApi('mutation($id:ID!){ revealClue(id:$id, clue:"grade"){ coins usedFreeClue } }', { id: flame.id }, target.token);
  assert.equal(first.body.data.revealClue.usedFreeClue, true);
  assert.equal(first.body.data.revealClue.coins, coinsBefore, 'the free tile must not move the balance');

  // Spent for the day: the next clue falls through to coins.
  const mid = await callApi('{ shop { freeClueReady } }', undefined, target.token);
  assert.equal(mid.body.data.shop.freeClueReady, false);
  const second = await callApi('mutation($id:ID!){ revealClue(id:$id, clue:"initial"){ coins usedFreeClue } }', { id: flame.id }, target.token);
  assert.equal(second.body.data.revealClue.usedFreeClue, false);
  assert.ok(second.body.data.revealClue.coins < coinsBefore);
});

test('a member pays nothing for either clue and keeps the free tile unspent', async () => {
  const voter = await makeSchoolUser();
  await callApi('mutation{ updateMe(firstName:"Mia", grade:"10"){ id } }', undefined, voter.token);
  const target = await makeSchoolUser();
  await callApi('mutation{ legacyGodMode }', undefined, target.token);
  await voteTwice(voter.token, target.userId);

  /* Membership buys the clues, it does not skip them: a member's tiles arrive sealed and empty, same
     as anyone's, and the scratch is the thing they paid to keep doing for nothing.

     The two flags must agree with the two values, in both directions — a clue is in the payload if and
     only if its tile is open. When they disagreed (the initial shipped for members while `revealed`
     stayed false) the Aura list printed "starts with M" beside a clue screen still selling that tile. */
  const before = await callApi(LADDER_QUERY, undefined, target.token);
  const flame = before.body.data.flames.flames[0];
  assert.equal(flame.gradeRevealed, false);
  assert.equal(flame.grade, '');
  assert.equal(flame.revealed, false);
  assert.equal(flame.initial, null);
  const coinsBefore = before.body.data.flames.coins;

  for (const clue of ['grade', 'initial']) {
    const r = await callApi(
      'mutation($id:ID!,$c:String!){ revealClue(id:$id, clue:$c){ coins usedFreeClue } }',
      { id: flame.id, c: clue },
      target.token
    );
    assert.ok(!r.body.errors, JSON.stringify(r.body.errors));
    assert.equal(r.body.data.revealClue.coins, coinsBefore, `${clue} must be free for a member`);
    // The daily free tile is for people who pay — a member must never have theirs consumed.
    assert.equal(r.body.data.revealClue.usedFreeClue, false);
  }
  assert.equal((await callApi('{ shop { freeClueReady } }', undefined, target.token)).body.data.shop.freeClueReady, true);

  // …and having scratched them, the member has both, with the flags agreeing.
  const after = await callApi(LADDER_QUERY, undefined, target.token);
  const opened = after.body.data.flames.flames.find((f: { id: string }) => f.id === flame.id);
  assert.equal(opened.gradeRevealed, true);
  assert.equal(opened.grade, '10');
  assert.equal(opened.revealed, true);
  assert.equal(opened.initial, 'M');
});

/* The sender's own membership outranks the viewer's, and outranks a purchase already made.

   Anonymity has to be retroactive or it isn't a promise: someone can buy a clue about you and *then*
   you sign up for Infinite Aura. The flags are recomputed per request off the sender's current state,
   so the grade and the initial go back in the envelope — and the clue screen shows those tiles as
   hidden rather than as foil with a price, because revealClue refuses to sell them at any price. */
test('a sender who becomes anonymous takes back clues that were already bought', async () => {
  const voter = await makeSchoolUser();
  await callApi('mutation{ updateMe(firstName:"Nina", grade:"9"){ id } }', undefined, voter.token);
  const target = await makeSchoolUser();
  await callApi('mutation{ legacyGodMode }', undefined, target.token);
  await voteTwice(voter.token, target.userId);

  const flame = (await callApi(LADDER_QUERY, undefined, target.token)).body.data.flames.flames[0];
  for (const clue of ['grade', 'initial']) {
    await callApi('mutation($id:ID!,$c:String!){ revealClue(id:$id, clue:$c){ ok } }', { id: flame.id, c: clue }, target.token);
  }
  const bought = (await callApi(LADDER_QUERY, undefined, target.token)).body.data.flames.flames[0];
  assert.equal(bought.grade, '9');
  assert.equal(bought.initial, 'N');

  // The sender signs up, after the fact.
  await callApi('mutation{ legacyGodMode }', undefined, voter.token);

  const hidden = (await callApi(LADDER_QUERY, undefined, target.token)).body.data.flames.flames[0];
  assert.equal(hidden.grade, '', 'an anonymous sender\'s grade is withheld even from a member');
  assert.equal(hidden.gradeRevealed, false);
  assert.equal(hidden.initial, null);
  assert.equal(hidden.revealed, false);
  /* The flame itself doesn't disappear, and the client is told why the tiles won't open. Gender is not
     asserted here because it's never blanked by anonymity — the cohort floor is what governs that one,
     and its own test covers it. */
  assert.equal(hidden.anonymous, true);
});

test('an unknown clue name is rejected rather than silently charged', async () => {
  const voter = await makeSchoolUser();
  const target = await makeSchoolUser();
  await voteTwice(voter.token, target.userId);
  const flames = await callApi(LADDER_QUERY, undefined, target.token);
  const r = await callApi(
    'mutation($id:ID!){ revealClue(id:$id, clue:"name"){ ok } }',
    { id: flames.body.data.flames.flames[0].id },
    target.token
  );
  // Notably including "name" — coins must never buy a first name, so it isn't a valid clue here.
  assert.match(r.body.errors[0].message, /Unknown clue/);
});

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
  assert.match(r.body.errors[0].message, /You need 1 coin for that clue/);
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
  assert.match(r.body.errors[0].message, /Infinite Aura required/);
});

/* 15A replaced two rules here with none: a single pick used to be refused ("picked you twice"), and a
   member used to get at most two distinct names. Infinite Aura's paywall promises "first names on every
   flame you get", so both limits had to go or the copy would be false. These two tests are the old ones
   inverted — they now fail if a limit ever creeps back. */
test('reveal-name works on a single pick, not just a repeat admirer', async () => {
  const voter = await makeSchoolUser();
  const target = await makeSchoolUser();
  await callApi('mutation{ legacyGodMode }', undefined, target.token);
  const r = await callApi('{ pollRound { roundId polls { questionId } } }', undefined, voter.token);
  const q = r.body.data.pollRound.polls[0];
  await callApi('mutation($q:ID!,$t:ID!,$r:ID!){ vote(questionId:$q, targetId:$t, roundId:$r){ ok } }', { q: q.questionId, t: target.userId, r: r.body.data.pollRound.roundId }, voter.token);
  const flames = await callApi(FLAMES_QUERY, undefined, target.token);
  const reveal = await callApi('mutation($id:ID!){ revealFlameName(id:$id){ name } }', { id: flames.body.data.flames.flames[0].id }, target.token);
  assert.ok(!reveal.body.errors, `a single pick should reveal: ${JSON.stringify(reveal.body.errors)}`);
  assert.ok(reveal.body.data.revealFlameName.name.length > 0);
});

test('reveal-name is unlimited for a member — every admirer, no cap', async () => {
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
    results.push(await callApi('mutation($id:ID!){ revealFlameName(id:$id){ name } }', { id: f.id }, target.token));
  }
  /* Zero rejections across three distinct admirers is the whole assertion: the old cap refused the
     third one, so this fails the moment a limit returns. Deliberately NOT asserting three distinct
     name strings — createTestUser never sets firstName/lastName, so every reveal returns the same
     placeholder and a distinct-name check would fail on the fixtures rather than on the rule. */
  const rejected = results.filter(r => r.body.errors);
  assert.equal(rejected.length, 0, `no reveal should be refused: ${JSON.stringify(rejected.map(r => r.body.errors))}`);
  assert.equal(results.length, 6);
  for (const r of results) assert.ok(typeof r.body.data.revealFlameName.name === 'string');
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

test('blocking hides that admirer’s flames, and unblocking brings them back', async () => {
  const voter = await makeSchoolUser();
  const target = await makeSchoolUser();
  await voteTwice(voter.token, target.userId);

  const before1 = await callApi(FLAMES_QUERY, undefined, target.token);
  assert.equal(before1.body.data.flames.flames.length, 2, 'both flames land before any block');

  // Read-time filter, not a delete — see flamesFor. The blocked list's copy promises exactly this
  // round trip, so the reversibility is the part worth pinning down.
  await callApi('mutation($id:ID!){ block(userId:$id) }', { id: voter.userId }, target.token);
  const blocked = await callApi(FLAMES_QUERY, undefined, target.token);
  assert.equal(blocked.body.data.flames.flames.length, 0, 'a blocked admirer’s flames are hidden');

  await callApi('mutation($id:ID!){ unblock(userId:$id) }', { id: voter.userId }, target.token);
  const unblocked = await callApi(FLAMES_QUERY, undefined, target.token);
  assert.equal(unblocked.body.data.flames.flames.length, 2, 'unblocking restores them');
});

test('a flame is hidden when the admirer blocks the target, not just the other way round', async () => {
  const voter = await makeSchoolUser();
  const target = await makeSchoolUser();
  await voteTwice(voter.token, target.userId);

  // notBlocked() is mutual, so this direction has to hide them too.
  await callApi('mutation($id:ID!){ block(userId:$id) }', { id: target.userId }, voter.token);
  const flames = await callApi(FLAMES_QUERY, undefined, target.token);
  assert.equal(flames.body.data.flames.flames.length, 0);
});

const BOARD_QUERY = `
  query($scope: String) {
    board(scope: $scope) {
      resetsAt
      flamesToTopTen
      entries { rank userId name grade flames blocked }
      me { rank flames }
    }
  }
`;

test('the board ranks by flames received and pins your own row', async () => {
  const top = await makeSchoolUser();
  const mid = await makeSchoolUser();
  const voterA = await makeSchoolUser();
  const voterB = await makeSchoolUser();
  await callApi('mutation{ updateMe(firstName:"Top", lastName:"Scorer"){ id } }', undefined, top.token);

  // Two admirers for `top`, one for `mid` — so the ordering is unambiguous.
  await voteTwice(voterA.token, top.userId);
  await voteTwice(voterB.token, top.userId);
  await voteTwice(voterA.token, mid.userId);

  const board = await callApi(BOARD_QUERY, { scope: 'overall' }, top.token);
  const entries = board.body.data.board.entries;

  /* Relative, not absolute: every test in this file shares one school, so earlier tests have already
     put their own targets on this board — asserting rank 1 here just measures test ordering. What
     matters is that more flames means a better rank, and that ranks ascend with the list. */
  const topRow = entries.find((e: any) => e.userId === top.userId);
  const midRow = entries.find((e: any) => e.userId === mid.userId);
  assert.ok(topRow && midRow, 'both targets appear on the board');
  assert.ok(topRow.flames > midRow.flames, 'four flames beats two');
  assert.ok(topRow.rank < midRow.rank, 'more flames means a lower rank number');
  assert.equal(topRow.name, 'Top Scorer', 'unblocked rows carry the real name');
  assert.deepEqual(
    entries.map((e: any) => e.rank),
    entries.map((_: any, i: number) => i + 1),
    'ranks are 1..n in list order'
  );

  // The pinned row is the caller's own, wherever they placed.
  assert.equal(board.body.data.board.me.rank, topRow.rank);
  assert.equal(board.body.data.board.me.flames, topRow.flames);
  assert.ok(Date.parse(board.body.data.board.resetsAt) > Date.now(), 'resetsAt is in the future');
});

test('a blocked person keeps their rank and score on the board but loses their name', async () => {
  const viewer = await makeSchoolUser();
  const rival = await makeSchoolUser();
  const voter = await makeSchoolUser();
  await callApi('mutation{ updateMe(firstName:"Rival", lastName:"Person"){ id } }', undefined, rival.token);
  await voteTwice(voter.token, rival.userId);

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
  assert.equal(rivalAfter.flames, rivalBefore.flames, 'score is unchanged by blocking');
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
  /* Its own school, not the shared "Flames High": every test in this file adds users to that one, so
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

test("a flame withholds gender and grade when the sender's cohort is too small to hide in", async () => {
  const voter = await makeSchoolUser();
  const target = await makeSchoolUser();
  /* A deliberately rare cohort: nobody else in this test school is a nonbinary 12th-grader, so the
     cohort size is 1 and naming both attributes would identify the sender outright. */
  await callApi('mutation{ updateMe(gender:"nonbinary", grade:"12"){ id } }', undefined, voter.token);
  await voteTwice(voter.token, target.userId);

  const flames = await callApi(
    '{ flames { flames { gender grade detailHidden } } }',
    undefined,
    target.token
  );
  /* Checked before indexing so a future failure says "no flames arrived" instead of dying on
     `undefined.detailHidden` — this test failed once in CI in exactly that unhelpful way and the cause
     could not be read from the output. */
  const list = flames.body.data.flames.flames;
  assert.equal(list.length, 2, 'both votes should have landed as flames');
  const f = list[0];
  assert.equal(f.detailHidden, true, 'a cohort of one is below the floor');
  // Blanked in the payload too, so a client that ignores the flag still cannot leak them.
  assert.equal(f.gender, 'private');
  assert.equal(f.grade, '');
});

const PUBLIC_PROFILE_QUERY_T = `
  query($userId: ID!) {
    publicProfile(userId: $userId) {
      name username blocked flames rank
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

test('superlatives aggregate a target’s flames per prompt, most-picked first', async () => {
  const target = await makeSchoolUser();
  const voterA = await makeSchoolUser();
  const voterB = await makeSchoolUser();

  /* Both voters are pointed at *the same* prompt on purpose. Letting voteTwice choose meant each voter
     answered whichever questions came first in their own independently shuffled round — so whether any
     single prompt reached a count of 2 was a coin flip, and the assertion below failed roughly one run
     in six. Aggregation is the thing under test, so the shared prompt has to be deliberate. */
  const roundA = await callApi('{ pollRound { roundId polls { questionId } } }', undefined, voterA.token);
  const shared = roundA.body.data.pollRound.polls[0].questionId;
  await callApi(
    'mutation($q:ID!,$t:ID!,$r:ID!){ vote(questionId:$q, targetId:$t, roundId:$r){ ok } }',
    { q: shared, t: target.userId, r: roundA.body.data.pollRound.roundId },
    voterA.token
  );

  // Every seeded poll appears in every round, so voterB can be aimed at the same questionId.
  const roundB = await callApi('{ pollRound { roundId polls { questionId } } }', undefined, voterB.token);
  await callApi(
    'mutation($q:ID!,$t:ID!,$r:ID!){ vote(questionId:$q, targetId:$t, roundId:$r){ ok } }',
    { q: shared, t: target.userId, r: roundB.body.data.pollRound.roundId },
    voterB.token
  );

  const r = await callApi('{ mySuperlatives { text count } }', undefined, target.token);
  const chips = r.body.data.mySuperlatives;
  assert.equal(chips.length, 1, 'one prompt, so one chip');
  assert.equal(chips[0].count, 2, 'two different voters on the same prompt count twice');

  // Ordering is by count desc, which is what puts the biggest trophy first on Profile.
  assert.deepEqual(
    chips.map((c: any) => c.count),
    [...chips.map((c: any) => c.count)].sort((a: number, b: number) => b - a)
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

test('completing a round advances the streak once per day', async () => {
  const player = await makeSchoolUser();
  const target = await makeSchoolUser();

  const before1 = await callApi('{ me { streak } }', undefined, player.token);
  assert.equal(before1.body.data.me.streak, 0, 'a new account has no streak');

  const round = await callApi('{ pollRound { roundId polls { questionId } } }', undefined, player.token);
  const roundId = round.body.data.pollRound.roundId;
  const q = round.body.data.pollRound.polls[0];
  await callApi(
    'mutation($q:ID!,$t:ID!,$r:ID!){ vote(questionId:$q, targetId:$t, roundId:$r){ ok } }',
    { q: q.questionId, t: target.userId, r: roundId },
    player.token
  );
  await callApi('mutation($r:ID!){ completeRound(roundId:$r){ earned } }', { r: roundId }, player.token);

  const after1 = await callApi('{ me { streak } }', undefined, player.token);
  assert.equal(after1.body.data.me.streak, 1);

  /* A second completed round on the same day must not advance it — the flame counts days played, not
     rounds. completeRound is idempotent per round, so this plays a fresh one. */
  const round2 = await callApi('{ pollRound { roundId polls { questionId } } }', undefined, player.token);
  const roundId2 = round2.body.data.pollRound.roundId;
  await callApi(
    'mutation($q:ID!,$t:ID!,$r:ID!){ vote(questionId:$q, targetId:$t, roundId:$r){ ok } }',
    { q: round2.body.data.pollRound.polls[1].questionId, t: target.userId, r: roundId2 },
    player.token
  );
  await callApi('mutation($r:ID!){ completeRound(roundId:$r){ earned } }', { r: roundId2 }, player.token);

  const after2 = await callApi('{ me { streak } }', undefined, player.token);
  assert.equal(after2.body.data.me.streak, 1, 'still 1 — same day');
});
