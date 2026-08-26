# Design requests — what's still missing

Written after implementing 3A (Vote, tab bar) and 5A (auth: welcome, code, returning handoff,
onboarding ground rules). Everything below is either **undesigned**, or designed but with a gap
that surfaced only once it hit real code and real data.

Direction is settled — **3A "Lights Out / Monokai"**, tokens in `README.md`, plus 5A's
account-surface rules (mint CTAs for account surfaces, pink for errors/alerts only). Nothing here
needs a new visual direction; these are new screens and states within the existing one.

---

## 1. Undesigned screens that block real flows

These have working backend mutations and no design at all. Ranked by how much they block.

### 1.1 Settings — **highest priority**
Screen 6 (Profile) draws a `⚙️` in its nav row, but nothing behind it. That's where the
account-lifecycle actions have to live, and two of them are App Store gates:

- **Sign out.** No design anywhere. Currently hand-rolled onto the landing screen purely as an
  escape hatch, which is the wrong home for it.
- **Delete account.** `deleteMe` exists server-side and cascades correctly. Apple **requires**
  in-app account deletion for any app with account creation — this is a submission blocker, not a
  nice-to-have. Needs the destructive-confirm treatment, which the system has no pattern for yet.
- Notification preferences (once push exists — see 3.1).
- Links to Terms / Privacy.

### 1.2 Blocked list / report flow
`blockUser`, `unblockUser`, and `reportUser` all exist. Screen 6 has a "Block or report someone"
row, but the destination is undesigned: the picker, the report-reason form, the confirmation, and
the blocked-list management view. Safety surfaces are also the strongest defense if a reviewer
flags the anonymity angle, so these should look deliberate rather than improvised.

### 1.3 Country picker
The phone field's `🇺🇸 +1 ▾` chip implies a picker that doesn't exist. Currently everything
submits as `+1` and the caret is presentational. Either design the picker or drop the affordance —
right now it promises something that goes nowhere.

### 1.4 `add.tsx` and `about.tsx`
Both flagged "not designed" in the original handoff and both still stubs. Add+ matters more:
it's the friend-graph surface that feeds candidate quality.

---

## 2. Onboarding — reconcile the step count

**The progress bar says 4 steps. The implementation has 7:**
`rules → age → grade → school → name → username → gender`

Designed so far: step 1 (ground rules, from 5A) and the school picker (screen 8, labelled
"step 2 of 4"). Steps 3 and 4 were never designed, so the middle of the flow is currently
old default-styled screens behind a 5A-styled front door.

**What each field actually earns, checked against the code:**

| Field | Used by | Verdict |
|---|---|---|
| `school` | Scopes the whole app | Essential |
| `age` | Server enforces 13+ (`MIN_AGE`), blocks completing onboarding | Essential |
| `name` | How classmates identify you in the voting grid | Essential |
| `grade` | Flame subtitles ("Someone in 11th grade picked you") | Keep |
| `gender` | Flame detail ("Girl · 11th grade") | Keep |
| `username` | **Only** shown/edited on Profile — nothing else reads it | Move to Profile |
| `photo` | Exists on the `User` type, **read nowhere** | Dead — cut or design it |

**Update: "Link Instagram" is gone, replaced by socials on the Me tab.** 6A's Settings row promised an
Instagram profile photo, which can't be delivered: Meta shut down the Basic Display API in December
2024, and its replacement only reads *professional* accounts, so a high-school audience on personal
accounts would mostly get nothing. The `photo` field above is still dead — an uploaded photo (R2, not
the current 500KB base64-in-JSONB field) is the viable route if avatars are wanted.

What shipped instead is a linktree-style block on Profile: Instagram, Snapchat, TikTok and Spotify
handles, stored on the user and opened as web links. Handles are **unverified by design** — anyone can
type anyone's — so nothing in the app treats them as identity, and impersonation stays covered by 8A's
existing report reason. See `packages/api-client/src/socials.ts`.

**Request:** design steps 3 and 4 as a 4-step flow — suggested
`rules → school → grade + age → name + gender`, with `username` moving to Profile. If the intent
is genuinely more than 4 steps, the bar needs to say so.

**Copy problem:** the ground-rules card states *"We check your grade with your school."* Nothing
in the product does this. Either it becomes real or the line changes — it's a trust claim, and
it's the one screen where trust is the entire point.

---

## 3. New onboarding steps worth adding

### 3.1 Push permission — **the highest-value missing step**
There is no push infrastructure at all (`expo-notifications` isn't installed; the existing
`useNotifications` is an in-app feed, not push). For an app whose entire loop is *"someone picked
you"*, a user who never grants push effectively never comes back.

Needs a priming screen — the ask framed by the payoff — placed right after the ground rules
establish what flames are, and before the OS prompt fires. Also needs the denied state.

### 3.2 Friend seeding
`suggestions`, `friends`, and `addFriend` already exist; no new API needed. A brand-new user has
zero friends and therefore the thinnest possible candidate pool. Profile's invite card already
carries the argument — *"Every friend who joins puts you in more people's polls"* — and onboarding
is when it's most true. Needs the contacts-permission variant too.

### 3.3 Recorded consent
"By continuing you agree to the Terms and Privacy Policy" is display text only; nothing is stored.
Given the 13+ audience, actual recorded acceptance (with a timestamp) is worth designing rather
than retrofitting under submission pressure.

---

## 4. States the design system has no pattern for

Hit repeatedly while implementing; each one currently improvised.

- **Account failed to load.** Valid session, `me` won't fetch. Dead end without a sign-out escape.
  Currently hand-rolled.
- **Destructive confirm.** Nothing exists for delete-account or unfriend.
- **Generic error / retry.** Every screen invents its own.
- **Offline / no connection.**
- **Loading.** Only the Vote screen has a defined skeleton; Inbox, Ranks, and Profile don't.
- **Empty states beyond the two already specified** (no flames, no round) — e.g. empty Ranks, no
  friends, no search results.

---

## 5. Already designed, not yet built

Not requests — just the queue, so it's clear what's outstanding vs. missing. Every one of these is
still rendering in default styling:

| Screen | Design | Status |
|---|---|---|
| Flames inbox | README §2, redrawn in **12A** | ✅ built in 6A styling |
| Scratch reveal | README §3 | not built — the flame detail is still a plain overlay |
| God Mode paywall | README §4 | built, **pre-redesign styling** |
| Ranks board | README §5, redrawn in **12A** | ✅ built, incl. the `board` query |
| Profile | README §6, redrawn in **13A** | ✅ built: own profile, public profile, edit sheet |
| Candy shop | README §7 | not built |
| Onboarding school picker | README §8 | ✅ built in 6A styling (10A states) |

Remaining from this table, in the order that unblocks the most: the **scratch reveal** (§3 — the one
place a core mechanic still has no designed surface), then the **candy shop** (§7, the whole economy),
then the **God Mode paywall** restyle (§4).

13A also closed §2's request to move `@handle` out of onboarding: the edit sheet is now its home. The
onboarding step still exists, so dropping it is a follow-up whenever the 7-step bar gets revisited.

### 5.1 Should a Vote card open that person's profile? — answered by 14A ✅
**Long-press, and the discoverability problem is solved with copy rather than a second tap target:** a
standing "Tap to pick. Hold to peek at a profile." line under the grid, plus a ✋ HOLD chip on one card
for a user's first three rounds. The hold opens a peek *card*, not a navigation, so it can never resolve
into a vote; "Full profile" inside the card is the route to `/u`. The original reasoning follows.

Now that public profiles exist, the Vote grid is the one place you see someone's name and *can't* look
them up. The catch is that a tap on a candidate card **is** the vote — 3A has no confirm step — so any
tap-to-open affordance competes with an irreversible action. Options considered: long-press (safe,
undiscoverable), a small corner chevron (discoverable, but two targets in a card built for one), or
leave it closed. No privacy issue either way: candidate names are already on the cards and profile
views aren't recorded. Needs a design call before anything is added to the core loop.

---

## 6. Known gaps in what's already built

Not design requests — implementation debt, written down so it doesn't get rediscovered later.

### 6.1 The "Friend joined Aura" push has no trigger
7A's third toggle is built end to end — the preference persists, and `sendPush(..., 'friendJoined', ...)`
gates on it correctly — but **nothing ever calls it**, because there is no "joined" event in the data
model. `addFriend` is a mutual add between two existing accounts, not a signup, so there's no moment
where "someone you invited signed up" is true. The switch currently saves a preference that can never
fire.

Needs either an invite mechanism (an invite code or contact-sourced link that ties a new signup back
to whoever invited them — which is also §3.2's friend seeding) or the toggle should come out of the
prefs screen until one exists. Don't just wire it to `addFriend`: that would notify on every friend
add, which is a different and much noisier notification than the one the design promises.

### 6.2 The round announcement is one fixed UTC time, unbatched
`sendRoundAnnouncement` (apps/api/src/push.ts, fired by the cron in wrangler.toml) has two limits
that are fine at current scale and will not be fine at launch:

- **One clock for everyone.** It fires at 20:15 UTC, which is the design's "3:15 pm" only in US
  Eastern. Each user's *quiet hours* are correctly evaluated in their own local time from their stored
  offset, so nobody gets woken at 3am — but a Pacific user gets it at 12:15pm, mid-morning. Fixing it
  properly means bucketing users by stored offset and running the cron hourly, sending only the
  buckets whose local time has just hit the target.
- **One HTTP request per user.** Expo's push API accepts up to 100 messages per request; the sender
  loops users one at a time. At a few hundred users this is slow but harmless; at a few thousand it
  will exceed the Worker's CPU/subrequest limits for a single scheduled invocation.

Also worth noting: the design's mock says "12 minutes left", which no round actually has — rounds are
built on demand and carry no server-side deadline. The shipped copy says "Go pick someone." instead.
If a real countdown is wanted, rounds need an expiry the server owns.

### 6.3 "Blocked on the board" — resolved ✅ (Ranks now exists)
Built as part of 12A: `apps/mobile/app/(app)/ranks.tsx` plus a `board` query
(`apps/api/src/board.ts`). The masking rule below is implemented server-side, so the client never
receives an identity it isn't allowed to render, and two tests in `apps/api/test/flames.test.ts` pin
the "rank and score unchanged, name masked, row still listed" behaviour.

**Scope semantics, decided with the product owner:** Overall = this week, My grade = this week
restricted to your grade, **Hottest = the last 24 hours**. There is no "hottest" prompt in the poll
library, so that chip is a time window rather than a question — worth remembering before someone
"fixes" it by hunting for a poll.

The week is Sunday→Sunday in **UTC**, not per-user local time: a shared leaderboard has to reset at
the same instant for everyone, or two students at the same school disagree about the standings on a
Sunday evening. The countdown pill reads the server's `resetsAt` for the same reason.

Original note, kept for context:

### 6.3a Why the masking has to be viewer-relative
8A gained a fifth screen after the first four were built: a blocked person appearing in the Ranks
board keeps their **rank and score** but loses their **identity** (grey 🚫 avatar, the label
"Blocked", subtitle "You blocked this person"), and the row is not tappable. It applies to the podium
too — 1st place can read 🚫 / "Blocked" / 184 / 1ST.

The masking is **viewer-relative** (blocked by *me*, not globally hidden), which is why the board
query applies the caller's blocked list at read time instead of serving a pre-computed public
leaderboard — and why the SQL aggregate deliberately counts every vote, leaving masking to the
resolver.

### 6.4 Blocking hides an admirer's flames — resolved, with a copy change ✅
The design's copy said a blocked person's flames were *"gone for good either way"*, and the backend
did nothing of the kind: `block` never touched the `votes` rows and `flamesFor` had no blocked filter,
so a blocked person's flames kept showing in the inbox.

**Resolved by filtering at read time rather than deleting.** `flamesFor` now drops votes whose voter
fails `notBlocked()` — the same mutual check round eligibility uses, so a flame from someone who
blocked *you* is hidden too. The vote rows survive, which means **unblocking brings the flames back**,
and the blocked-list copy was rewritten to say that instead of promising permanence. Covered by two
tests in `apps/api/test/flames.test.ts` (the hide/restore round trip, and the block-in-the-other-
direction case).

Deleting the votes on block was the alternative and was deliberately rejected: it would silently
destroy data on an action the UI presents as reversible.

Still open for §6.3: whatever the Ranks board totals has to decide whether those hidden votes still
count toward a blocked person's public score. The 8A "Blocked on the board" screen implies **yes** —
it keeps rank and score truthful and only masks identity — which means the board total must NOT reuse
this viewer-relative filter.

---

## 7. Candy, boosts and the shop — the whole economy is undesigned

The currency exists and is already being spent, but there is **no shop screen and no price list
anywhere in the product**. This is the largest undesigned area left, and it's the only one that
touches money.

### 7.1 What already works server-side
| Thing | Where | State |
|---|---|---|
| Earning candy | `completeRound` pays out once per round | ✅ real, tested (no double-claim) |
| Coin reveal (1 coin → an admirer's initial) | `revealFlame` | ✅ real, tested |
| Bonus name reveal (God Mode, max 2 admirers) | `revealFlameName` | ✅ real, tested |
| Random boost — 100 candy, appear in 3 extra polls | `boostRandom` | ✅ real, **priced server-side** |
| Crush boost — 300 candy, appear in one person's polls | `boostCrush` | ✅ real, **priced server-side** |
| God Mode via Apple IAP | `validateIap` + `iap.ts` | ⚠️ works, but in **dev-trust** mode |

### 7.2 What's missing
1. **The shop screen itself** (README §7, never drawn in 6A/12A). Candy is earned and shown in the
   Vote header, and there is no screen that says what it buys. Needs: the balance, the two boosts with
   their real prices and what each actually does, and the God Mode upsell — plus the "not enough
   candy" state, which is currently a raw thrown error string.
2. **A price list the client can read.** Boost prices (100 / 300) are hardcoded in the resolver and
   *duplicated nowhere* — the UI has no way to display a price without hardcoding it a second time
   and drifting. A `shopItems` query (id, label, description, price, what it grants) would make the
   screen data-driven and keep one source of truth.
3. **Candy top-up.** There is no way to *buy* candy — only to earn it by voting. If candy is meant to
   be purchasable, that's a second IAP product line and a second paywall; if it isn't, the shop should
   say so plainly, because "earned only" is itself a selling point worth stating.
4. **The boost's payoff is invisible.** `boostRandom` says "You'll appear in 3 random polls" and then
   nothing ever reports back. No "your boost is active, 2 uses left", no result. Spending 100 candy
   for an outcome you can't observe is the weakest link in the loop.
5. **God Mode's real state.** `godModeExpires` exists, and no screen shows when it lapses or offers a
   renew. 12A's Inbox banner says "God Mode is on" and stops there.

### 7.3 One piece of cleanup to fold in
`shopBoost(cost: Int!)` takes its **price from the client** and grants nothing — it only debits
whatever number it's handed. It's a leftover from the web demo (the api tests use it to drain a
balance to zero). It can't be exploited for gain, since you can only subtract from your own balance,
but it should be deleted or replaced by the real catalogue rather than shipped: an endpoint whose
price is client-supplied is exactly the shape of a bug someone finds later.

Not design requests — implementation debt, written down so it doesn't get rediscovered later.

---

## 8. School critical mass and the anonymity floor — built ✅, but only half designed

Two product mechanics added because the app was quietly broken in small schools. Both are live; both
would benefit from a real design pass on the states they introduce.

### 8.1 The board unlocks at 20 people
`SCHOOL_UNLOCK_THRESHOLD` in `apps/api/src/board.ts`. Below it, `board` returns **no entries at all** —
withheld server-side, not hidden by the client, since the standings are the thing being suppressed.

What the locked screen shows now (hand-built, not designed): a 🔒 cream card with "N more to unlock the
board", a progress bar, the member count, and an **Invite your class** button that opens the OS share
sheet with a plain text message.

Deliberately *not* gated: voting and flames keep working. The only way a school reaches 20 is the people
already there using the app, so locking the loop itself would be self-defeating.

**Worth designing properly:** the locked board is the first screen a brand-new school's first user sees
on the Ranks tab, and it's currently the least considered surface in the app. It's also the natural home
for whatever the real invite mechanic becomes (§3.2) — the share sheet here is a placeholder with no
attribution, which is why §6.1's "friend joined" notification still has no trigger.

### 8.2 Flames withhold gender and grade in small cohorts
`COHORT_FLOOR` in `apps/api/src/flames.ts`, currently 5. A flame's subtitle names the sender's gender
and grade — "a girl in 11th grade picked you" — which is only anonymous if enough people match it. With
four girls in 11th, that's a one-in-four guess, and one coin buys the first initial, which usually makes
it unique. The app's entire promise fails exactly where the school is smallest and everyone already
knows everyone.

So below five people sharing a (gender, grade) cohort, both attributes are withheld and the flame reads
"someone at your school". The values are blanked in the payload too, so a client ignoring the
`detailHidden` flag still can't leak them.

The coin-revealed initial is **not** suppressed: it's opt-in, it costs something, and it's the game.
This floor is about what leaks for free.

**Worth designing:** the withheld row currently reuses the normal flame row with different copy. A
designed treatment could make the scarcity legible — "your school is too small for us to say more yet"
is a trust-building message, not an apology, and it doubles as another reason to invite people.

---

## 9. Voting, reworked — rationed rounds, paid rerolls, follows

Designed as **14A (`Aura Voting.dc.html`)** and built — see 9.2 for what shipped, and the three open
items at the end of it. This is the core loop, so it was the most important set of screens still
rendering hand-built UI.

### 9.1 What changed and why
The old loop had three problems that fed each other:

1. **Unlimited rounds.** `pollRound` minted a fresh round on every mount of the Vote screen, so "today's
   round" was never true, the board was farmable by replaying, and there was no reason to come back
   tomorrow.
2. **"🔄 New four" was a lie.** It reshuffled the *same four people* client-side — no request, no new
   candidates.
3. **A cliff at 4 friends.** `friends.length >= 4 ? friends : mates` meant your 4th friend silently
   replaced the entire school with four people, and everyone below the line saw pure strangers.

The tbh/Gas shape fixes all three at once: a finite stack, then you're out — which is also the only
moment an invite prompt genuinely converts.

| Piece | Where | Value |
|---|---|---|
| Rounds resumable | `rounds.ts` stores the built polls | remounting returns the *same* round |
| Daily allowance | `DAILY_ROUND_LIMIT`, `servedRound` | **3/day**, refills at UTC midnight |
| Paid reroll | `REROLL_COST`, `rerollQuestion` | **3 candy**, one per question, excludes the current four |
| Follow weighting | `weightFollowing` / `weightFollower` / `weightSchoolmate` in `tuning.ts` | following ×3, follows-you ×2, schoolmate ×1 |

Every one of these numbers is a **guess**, and all of them are now dials in `tuning.ts` — settable from
the Cloudflare dashboard with no deploy. 3/day especially: it decides how much of the app a user can
consume per session, which is the single biggest tuning knob in the product.

### 9.2 Screens — designed and built (14A)
- **Rounds-left indicator.** Pips, not a second bar, left of the question counter, with the state named
  in words ("Round 2 of 3 today") so it never reads as a fuel gauge. Spent pips go flat, the live one is
  mint, unstarted is outlined.
- **Out of rounds.** Its own screen rather than 10A's generic empty state: purple "see you at midnight"
  tag, the day's real vote count (`PollRound.votesToday`), a live countdown to the UTC-midnight refill,
  and the two moves that actually change tomorrow's four as cream cards — follow more people, invite
  your class. Ends with a route into the Inbox rather than ending the session.
- **The reroll button, four states.** Affordable (price chip in yellow ink) / short (dimmed, price chip
  goes pink, **still tappable**) / pending ("Shuffling…", flat) / already rerolled (flat and darker, one
  per question). The short state opens a sheet instead of disabling the button, because "a disabled
  control teaches nothing": the sheet leads with *finish this round* — free, and the behaviour the
  product wants — and offers the shop second, never pink.
- **Long-press peek.** Holding a card lifts a peek card over the grid: avatar, handle, grade, up to three
  superlative chips, Follow, and Full profile. A card rather than a navigation, so a hold can never
  resolve into a vote. Discoverability is handled two ways: a standing "Tap to pick. Hold to peek" line
  under the grid, and a **✋ HOLD** chip on one card for a user's first three rounds
  (`me.roundsTotal < 3`, counted server-side so a reinstall doesn't re-teach it).
- **Round finished.** Not in 14A, but building it exposed that the mobile Vote screen had no branch for
  the `congrats` mode at all — completing all 12 questions dropped into the loading skeleton and stayed
  there. Now a short cream card with the real payout and either "Next round" or "Done for today", which
  re-queries and lets the server hand back the out-of-rounds state rather than duplicating it.

**Still open after 14A:**
1. **The boost payoff has no pip state.** 14A's own note: a boosted round should be visible as a fourth
   pip state, so the user can watch a boost being spent. Nothing renders it today.
2. **Candy has no shop.** The reroll sheet's second option says "Not on sale yet — rounds are the only
   way to earn", because there is no candy IAP or price catalogue (§7.2). The design prints
   "From 🍬 50 · $0.99"; that copy can't ship until the catalogue exists.
3. **"Let go to close" vs. a peek with buttons.** The mock's footer says the peek closes on release, but
   the same card carries Follow and Full profile, which a card that vanishes on release makes
   unreachable. Built as a persistent card ("Tap outside to close"). Worth a decision either way.

### 9.3 Follows are not friends
One-directional, no approval, no notification to the person followed — closer to Instagram than to a
friend request, which is why the code and copy call it *following* rather than *friends*. `addFriend` /
`removeFriend` survive as aliases so apps/web keeps working; both write the same `following` list.

Blocking severs the edge **both** directions, since leaving their follow in place would keep weighting
you into each other's polls.

**Resolved by 14A ✅.** The button has four states and lives in one place (`FollowButton` in
`voteKit.tsx`) so the People screen and the peek card can't drift: Follow / Follow back / Following ✓
(tap to unfollow, no confirm) / in-flight. There is deliberately no pending or requested state, because
following needs no approval and sends no notification.

On counts: **no follower or following counts anywhere**, confirmed. In a 200-person school that number
is a popularity score by another name. The only exception stays your *own* following count, and only as
a nudge toward §9.4. This is now enforced rather than merely observed — `User.following` resolves to an
empty list for anyone but yourself (or an admin), so `schoolmates { following }` can no longer be used
to read the school's follow graph. The one viewer-relative bit that is exposed is `followsMe`, which you
learn anyway the moment you see a "Follow back" button.

### 9.4 The people screen (`add.tsx`, was a stub) — designed and built ✅
14A's screen 4. Suggestions lead and search is secondary, because "a bare search box asks a student to
already know who they want". **Follows you** is its own group at the top: following back is the
highest-yield tap available, and it disappears from that group the moment you do it. Blocked people are
filtered out entirely (unlike 8A's report picker, which greys them in — the only action here is "follow",
which the server refuses for blocked users anyway).

All three things worth considering turned out to be worth doing:
- **Grade filters**, as a wrapping chip row rather than a scrolling one — six chips don't fit 362px, and
  an off-screen chip is an undiscovered filter. Built from the grades that actually exist among your
  schoolmates rather than a hardcoded 9–12, so a chip can't filter to nobody.
- **"Follow all of 11th grade"**, one tap, retargeting to whichever grade chip is selected. A single
  `followGrade` mutation rather than 86 client calls: 86 round trips isn't a tap, and each one would
  rewrite the same JSONB list from a stale copy, dropping follows at random.
- **Navigation call: People is not a fifth tab.** The bar stays VOTE / FLAMES / RANKS / ME (five 78px
  items don't fit 402px, and a tab would compete with voting for the same session). Its entry point is
  the mint person-plus button in the Vote and Me headers, plus the out-of-rounds card and the Me tab's
  following row.

---

## 10. Icons and the currency rename — 15A, built ✅

**36 drawn icons replace the emoji in every piece of app chrome.** One 24×24 grid, stroke-only, weight
2.2 (2.6 for the active tab), rounded caps and joins — the same soft geometry as Fredoka, so an icon
next to a heading reads as the same family. Emoji never did: they're a different artist per glyph, they
shift with every OS update, and they render at whatever weight Apple chose.

- **`react-native-svg` is now a dependency** (15.15.4, picked by `expo install`). It ships inside Expo
  Go, so this needs no dev build.
- **Path data is copied verbatim** from the design's `aura-icons.js` into
  `apps/mobile/src/components/AuraIcon.tsx`, and rendered through `SvgXml` rather than hand-converted
  into `<Path>` elements. Conversion is exactly the transcription that silently loses a decimal, and
  there'd be no way to diff the result against the source. **If an icon changes, change it in the
  design doc and re-copy.**
- **What stays emoji, per the design:** poll prompts and superlative pills. Those are *content* — polls
  are rows in a table and new ones ship without a design pass, so they can't depend on an icon
  existing. Chrome is drawn; content is typed. One addition to that list: **social-platform marks**
  (Instagram, Snapchat, TikTok, Spotify) on the Me tab, since the 36-icon set has no brand glyphs.

**The currency is coins, in silver** — fill `#D5D9E0`, shadow `#9AA0AE`, on-fill `#2A2E38`, exported
from `src/components/coin.ts` and added to the Tailwind palette. Deliberately outside the candy
palette: every other colour in the app means something in a vote (pink picked, mint safe, yellow won,
purple God Mode), so a balance in any of them would read as a vote colour. This also retires "candy",
which means the UI and the database column (`coins`) finally agree — they had disagreed since Phase 1.

**Still emoji, not yet converted:** the Inbox's flame-detail overlay (the pre-12A `Overlay`-based sheet
with 🔒/✅/👑/🔓 and the reveal buttons) and `LoadingScreen`. Both are chrome and both should get icons;
the detail overlay is worth doing as part of its own design pass rather than piecemeal.

---

## Suggested order

Items 1–5 of the original list are **done** (Settings + delete account, onboarding steps, push
priming, report/block/blocked list, and the error/loading/empty states — 6A, 7A, 8A, 10A). What's
left, reordered by what it unblocks:

1. **Poll seeding per school** — not a design item, but nothing else can be seen working without it.
   A school with no polls can't build a round, which means no votes, which means no flames and an
   empty board. A default global set (`schoolId: null` polls are already supported by `buildRound`)
   would make every new school work on day one.
2. **Profile / the trophy case** (§5, README §6) — the last stub tab, and the designed home for the
   username field §2 wants moved out of onboarding.
3. **Candy shop + price list** (§7) — the only place real money is involved, and currently the one
   earned currency in the app buys nothing the user can see.
4. **Scratch reveal** (§5, README §3) — the core mechanic with no designed surface.
5. **Friend seeding / invite loop** (§3.2) — candidate quality *is* the product; it also gives §6.1's
   dead "friend joined" notification a real trigger.
6. Country picker (§1.3), Add+/About (§1.4), God Mode paywall restyle (§5).
