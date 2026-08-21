# Activity feed — ideas backlog

> **Status: all five are built.** Kept as the record of why each one is shaped the way it is — in
> particular the guardrail at the bottom, which #5 looks like it breaks and doesn't. See also the
> note under #2, which did not turn out to be free.


Parked after the ungrouped-feed refactor (Activity leads the segment bar, one row per event,
friend rows backed by `friendActivity`). Ordered by (impact × cheapness × privacy safety).

**The problem all of these are solving:** the feed currently renders six consecutive rows reading
"A boy gave you aura". Identical rows are wallpaper — you scroll past them rather than read them.
Every idea below is about making each row carry a *different* fact.

---

## 1. Superlative + emoji on your own rows — free

Every `Aura` already carries `emoji`, `q` and `color`. The card *face* shows all three; the feed row
that links to that card shows less than the thing it links to.

> 🎤 A boy gave you aura for **Would win a talent show**

Disc becomes the poll emoji, so the feed gains colour and variety at the same time. No new query, no
new field, no new leak — it's your own card.

**Client-side only.** `apps/mobile/src/lib/auraTab.ts` (`ActivityItem`) + `ActivityRow` in
`apps/mobile/app/(app)/inbox.tsx`.

## 2. Repeat-admirer rows — free, and the best fact in the database

`pickCount` is on every aura already. The card prints "Voted for you 6 times"; the feed never
mentions it. But the *moment it becomes 6* is the most tantalising thing this app knows.

> ✨ Someone's picked you **6 times** now 👀

**Correction — this was not free.** "No query, no schema" was wrong. `pickCount` is on *all six* of a
sender's cards and `voterId` is on none of them (deliberately), so a client has no way to tell which
card made it six, and renders the same line six times — the exact problem the feed rewrite was fixing.

It needed one server boolean, `newestFromSender`, computed in `aurasFor`. Shipping `voterId` instead
would have let the client group cards by sender, which is precisely what an anonymous card hides.

## 3. Unflipped rows as the funnel

The row already navigates to `/flip`. Today it looks identical whether the card is face-down, opened,
or flipped. Differentiating them makes the feed the highest-traffic path to the one paid action in the
app. `opened`, `unread` and `name` are all already on `Aura`.

## 4. School pulse — one small query

> **62 picks at Lincoln High today**

Pure aggregate, no privacy surface. Its job is the *quiet day*: right now if nobody picked you,
Activity is dead, and a dead feed is one you stop opening.

Needs one `COUNT(*)` over votes joined to users by school — same shape as `countVotesBy` in
`apps/api/src/db.ts`.

## 5. Friend milestones — real data, but real work

"Lucas hit a 10-day streak", "Ava's won Best Smile ×5". `streak` is on the user row and superlatives
derive from votes, so both are honest. Unlike 1–3 this is new server surface.

---

## Suggested order

1–3 first: all client-side, no API change, no migration, and together they fix the actual problem.
Then 4 as a small server add. Hold 5 until the enriched feed has been seen in use.

## Guardrail — do not enrich friend *event* rows

**Note the word "event".** #5 puts a superlative on a friend milestone row and that is not a breach of
this rule — the distinction is per-vote versus per-person:

- a friend **event** is one anonymous vote. Naming the prompt on it ties a specific hidden voter to a
  specific claim about your friend, an object that exists nowhere else and that they never published.
- a friend **milestone** is the aggregate ("Emma's won Best smile ×5"), which `publicProfile` already
  returns to anyone at her school. It surfaces something she is already showing.

The rule below is about the first kind and still holds in full.


`FriendActivityEvent` carries a gender and a first name and nothing else, deliberately. See the long
note on `friendActivityFor` in `apps/api/src/auras.ts`. Ideas 1 and 2 apply to **your own rows only**:

- the superlative on a friend row forwards a fact about *them* that they never agreed to share
- `pickCount` on a friend row is a running tally of someone else's admirers

Both were designed out. If a future change makes friend rows richer, that's the thing to re-argue
first, not to slip in.

## Worth knowing before building 2 and 3

These two most sharpen the "pay to find out who" loop — the mechanic Apple's anonymous-content
guideline scrutinises hardest, and already the flagged risk on this app. Not a reason to skip them;
a reason to build them knowing a reviewer will look there first.
