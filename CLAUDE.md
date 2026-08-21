# Working notes for Claude Code in this repo

Project: Aura — `apps/web` (TanStack Start SPA) + `apps/mobile` (Expo/React Native) sharing a
GraphQL backend (`apps/api`, Cloudflare Workers) and a shared data-layer package
(`packages/api-client`). Plan is to go live as a real product, not stay a permanent demo.

## Running anything: nix + pnpm

This repo requires Node 24 + pnpm 11, provided via the `flake.nix`.

**Gotcha:** in a Claude Code `Bash` tool call, the shell is *not* the user's interactive shell —
plain `node` / `pnpm` are not on `PATH`. Prefix every command with `nix develop --command`:

```bash
nix develop --command pnpm turbo run typecheck test    # everything, all 4 packages
nix develop --command pnpm --filter web test           # apps/web only (Vitest + RTL)
nix develop --command pnpm --filter api test            # apps/api only (node:test, real Neon branch)
nix develop --command pnpm --filter mobile typecheck    # apps/mobile only
```

(`direnv exec .` also works if you have direnv installed and have already run `direnv allow` in
this directory — the repo's `.envrc` says `use flake` — but `nix develop --command` only needs
Nix itself and doesn't depend on an already-approved `.envrc`, so prefer it. Measured: the two are
not meaningfully different in speed, ~0.5s either way — this isn't a performance tradeoff.)

`pnpm --filter <name>` matches by the unscoped suffix of the package name (`web` matches
`@aura/web`), so either form works — the short form matches this repo's README.

`apps/mobile` and `packages/api-client` don't have test suites yet; `pnpm turbo run typecheck`
is what covers them. `apps/api`'s suite drops and recreates every table each run — it must point
at a disposable `TEST_DATABASE_URL`, never the real `DATABASE_URL`.

Long-running commands (the full `turbo run typecheck test` in particular takes minutes) should
go through `run_in_background: true` — don't let them eat the 120s foreground timeout.

## Standing collaboration rules

- **No git operations from Claude.** The user commits and pushes themselves.
- **Never paste real secrets into chat** — there was a `.dev.vars` incident earlier in this
  project; treat any `.env`/`.dev.vars` contents as sensitive even if asked to print them.
- **Phase-by-phase discipline** for feature work: plan → user approval → implement → verify
  (typecheck/test, not just "looks right") → honest report of cuts/gaps. Don't claim something
  works if it's only been typechecked, not actually run/tested against real behavior.
- If a "fix" would require guessing at an external system's config (Clerk dashboard settings,
  third-party account state, etc.), verify what's actually knowable from code/docs first, then
  say plainly what's left for the user to do — don't fabricate that it's handled.

## Naming: the app's vocabulary

The Gas-era words are gone from this codebase. Use the current ones in code, comments, copy and
GraphQL alike:

| Say | Not |
| --- | --- |
| aura / auras (`Aura`, `useAuras`, `aurasFor`) | flame / flames |
| Infinite Aura (`infiniteAura`) | God Mode / `godMode` |
| Aura, the app | Gas |

**Three exceptions, all deliberate — do not "finish the job" on these:**

- **`flame` is an icon name and means streak.** It's a literal fire glyph sitting next to a separate
  `aura` glyph in `AuraIcon`. Renaming it collides the two, *and it typechecks*, because
  `AuraIconName` derives from the keys — so the key and every caller stay consistent while pointing
  at the wrong drawing. Nothing else in the repo says "flame".
- **`aura.godmode.weekly` / `aura.godmode.lifetime` are App Store product IDs** (`schema.ts`).
  They're registered with Apple and attached to real purchases. Renaming them here doesn't rename
  them in App Store Connect — it just stops matching incoming receipts, breaking every restore.
- **`renameLegacyUserKeys` in `migrations.ts` must keep saying the old words**, because its job is to
  find rows written under them. A repo-wide replace turns it into a statement that strips and re-adds
  the same keys and migrates nothing, silently and with a green typecheck. (This happened during the
  original rename.)

`godMode`, `godModeExpires` and `notifyFlames` were **persisted JSONB keys**, migrated by
`renameLegacyUserKeys`. `User` is `{ [key: string]: unknown }`, so the compiler cannot catch a missed
JSONB key — it reads back `undefined`, which looks exactly like a user who never had the value. If
you add a key to that blob, remember it is outside the type system.

## UI copy: stop writing helper text

**Default to no explanatory line.** Blake has cut these repeatedly — "gender is free, the name never
is", "name locked" on every face-down card, "no cards from that group yet", "tap outside to close" —
and the pattern behind every cut is the same: the line explained something the screen was already
showing, and it cost layout to do it. The last one pushed the pager off its alignment.

Before adding a caption, subtitle, hint or empty-state sentence, ask what it says that the controls and
the data don't. If the answer is "it restates them", leave it out. An empty grid with a `0` on the chip
you just tapped is already an empty state. A face-down card already looks face down.

What *does* earn a line: something the user can't see and would otherwise get wrong — "They'll never
know you flipped their card", "Names are stripped from anything you post", "NOTHING SPENT" on a blank
reveal. Those carry a fact about consequences, not a description of the pixels.

Same rule for headers. The Aura tab's "Your aura" title, its status subtitle and its INFINITE pill all
came off for this reason: three elements and a fifth of the screen spent telling you which tab you had
just tapped.

## React: Effects

House rule, from an audit against https://react.dev/learn/you-might-not-need-an-effect:

- Don't use `useEffect` to compute/derive data from props or state for rendering — compute it
  inline during render (or `useMemo` if genuinely expensive).
- Don't chain Effects (Effect A sets state that Effect B reacts to) — do the whole thing in the
  event handler that started it.
- POST/mutations triggered by a user action belong in the event handler, not in an Effect keyed
  off some derived "should I submit now" state.
- Navigation redirects driven by auth/query state *are* legitimate Effects — synchronizing the
  URL with app state counts as an external system. See `_app.tsx`, `admin.tsx`, `index.tsx` in
  `apps/web/src/routes`, and `apps/mobile/app/index.tsx`.
- Raw `useEffect` + manual fetch is a smell in this codebase specifically because
  `packages/api-client` already wraps all normal fetching in React Query, which solves the
  race-condition/cleanup problem for free. If you see a bare `useEffect` doing a fetch or
  mutation on mount, ask *why it isn't a query* before "fixing" it.
  - But check whether the action is idempotent before converting it to `useQuery`. Example:
    `packages/api-client/src/hooks/useAuraRound.ts`'s `useEffect(() => { if (enabled) start() }, [enabled])`
    looks like a fetch-on-mount smell, but `startRound` (`apps/api/src/rounds.ts`) creates a
    brand-new non-idempotent round server-side — moving it to `useQuery` would cause duplicate
    rounds on window refocus/reconnect. Left as a raw Effect deliberately; this is correct, not an
    oversight. (The `enabled` gate itself exists so the round doesn't start before Clerk's auth
    state is actually ready — a cold-start deep link straight into `/aura` can otherwise fire this
    with a not-yet-resolved token.)
  - When you need to *freeze* a value derived from async data (e.g. "the notifications that
    were unread when the Inbox opened," even after they get marked read and the query
    refetches), don't do the freeze in an Effect — use the render-time "compare to a `prev`
    state" trick so it doesn't cost an extra render pass, and keep only the actual side effect
    (the mutation call) in the Effect. See `apps/web/src/routes/_app.inbox.tsx`.

## Architecture notes

- **Shared GraphQL hooks live in `packages/api-client`**, not duplicated per app. Each app
  supplies its own `gqlFetch` (its own `EXPO_PUBLIC_API_URL`/`VITE_*` base URL) and Clerk
  `getToken`, and wraps the shared hook. Before adding a new data hook to only one app, check if
  it should go in `api-client` instead (it should, unless it's truly app-specific).
- **Clerk differs by platform.** `apps/web` uses Clerk's prebuilt components
  (`@clerk/tanstack-react-start`, `<SignIn>`/`<SignUp>`). `apps/mobile` has no prebuilt native
  sign-in/sign-up, so those screens are hand-built against Clerk's newer "Future" signals API
  (`@clerk/expo`'s `useSignIn`/`useSignUp` returning `{ signIn }`/`{ signUp }` resources with
  methods like `signIn.phoneCode.sendCode()`, `signUp.password()`, `.finalize()`).
  - **Sign-up blocker is bot protection, NOT password.** Verified against this instance's
    `/v1/environment` (the Frontend API host is base64-encoded inside the publishable key):
    `phone_number` is the only *required* attribute, `password` is not enabled, and
    `sign_up.captcha_enabled: true` with `captcha_widget_type: smart` / provider `turnstile`.
    An earlier note here claimed a password was required — that was wrong; don't re-derive plans
    from it. Re-check `/v1/environment` rather than guessing if this seems to change.
  - `@clerk/expo` ships no native CAPTCHA widget (checked the SDK source, not just docs), so the
    Turnstile challenge can never be satisfied in-app. The symptom is confusing: `create` and the
    SMS code both succeed, then `finalize()` fails with "Cannot finalize sign-up without a created
    session". `apps/mobile/app/verify.tsx` names the real cause instead of echoing that.
  - Two dashboard fixes, and **which one works depends on the bundle ID**: `apps/mobile/app.json`
    sets no `ios.bundleIdentifier`/`android.package`, so in Expo Go the app runs as
    `host.exp.Exponent`. Registering your own bundle ID under **Native API**
    (dashboard.clerk.com/~/native-applications) therefore does nothing until there's a dev build —
    under Expo Go it's Expo's identifier, not Aura's. For Expo Go testing the working switch is
    turning **Bot sign-up protection** off (Configure → Protect → Rules). Native API is the
    production answer, and it's a deliberate security tradeoff (it opens a public bypass pathway)
    for the account owner to choose consciously, not something to toggle silently.
- **Admin dashboard is web-only by design.** `apps/web`'s `/admin` covers it; there's no plan to
  build a mobile admin UI (not a real need for a phone-sized screen).
- **Mobile roadmap** (approved, phase-by-phase): 1) Foundation ✅ 2) Onboarding ✅
  3) Main app shell + Aura (core voting loop) ✅ 4) Inbox/Auras 5) Add+/Profile/Shop+Infinite Aura.
