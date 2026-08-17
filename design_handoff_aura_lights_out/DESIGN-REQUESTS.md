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
| Flames inbox | README §2 | built, **pre-redesign styling** |
| Scratch reveal | README §3 | not built |
| God Mode paywall | README §4 | built, **pre-redesign styling** |
| Ranks board | README §5 | stub |
| Profile | README §6 | stub |
| Candy shop | README §7 | not built |
| Onboarding school picker | README §8 | built, **pre-redesign styling** |

---

## Suggested order

1. **Settings + delete account** — App Store blocker.
2. **Onboarding steps 3–4** — closes the half-restyled flow behind the new front door.
3. **Push priming** — biggest retention lever, and nothing exists yet.
4. **Report / block / blocked list** — safety surface, also review-risk mitigation.
5. **Error and loading states** — stops every screen improvising.
6. Friend seeding, country picker, Add+/About.
