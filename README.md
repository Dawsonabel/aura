# Aura

Aura is a school-scoped social app for teens built around anonymous positivity. Each round, a student is shown a short set of compliment-style prompts ("Who has the best smile?", "Who would you want as a lab partner?") paired with a handful of classmates from their own school, and picks one — anonymously. The picks are never shown live; instead they accumulate as "flames" on the receiving student's profile, so what you see is just *that people picked you*, not who, turning a normal school day into a slow drip of anonymous validation instead of a popularity contest played out in public.

The tension that drives engagement is curiosity about the "who": every flame is a small mystery. Students earn or buy **coins** and can spend them to reveal hints about an admirer (school, grade, a partial name) rather than their identity outright, and a paid **God Mode** tier unlocks stronger reveals and lets a student see more of who's been picking them. Underneath the fun mechanic sits a real safety surface, because the userbase skews to minors: every account is age-gated at sign-up, students can block or report anyone, and a full admin dashboard gives school/site moderators visibility into schools, poll content, individual votes, and filed reports.

Technically: a GraphQL backend on Cloudflare Workers (`apps/api`), a TanStack Start web app (`apps/web`) for students and admins, and a native Expo/React Native app (`apps/mobile`) for students, sharing a common GraphQL data layer (`packages/api-client`). Clerk handles auth (phone-number + SMS code), Neon Postgres is the database, and Upstash Redis backs rate limiting and ephemeral poll-round state.

## Run it

Requires [Nix](https://nixos.org/) (the flake provides Node 24 + pnpm) or Node 24 + pnpm 11 installed some other way.

```
nix develop        # or: direnv allow, if you use direnv
pnpm install
```

Each app needs its own local env file:

- `apps/api/.dev.vars` — copy from `apps/api/.dev.vars.example`: a Neon `DATABASE_URL`, Upstash Redis REST credentials, a Clerk secret key.
- `apps/web/.env` — copy from `apps/web/.env.example`: a Clerk publishable key, and `VITE_API_URL` pointing at `apps/api`'s local dev URL.
- `apps/mobile/.env` — copy from `apps/mobile/.env.example`: the same Clerk publishable key, and `EXPO_PUBLIC_API_URL` pointing at `apps/api`'s local dev URL (a physical device on Expo Go can't reach `localhost` on your machine — use your LAN IP, or run against a simulator).

Then, from the repo root:

```
pnpm dev            # runs apps/api (wrangler dev) and apps/web (vite dev) together, via Turborepo
pnpm --filter @aura/mobile start   # apps/mobile has its own dev server (Expo)
```

`apps/api/scripts/migrate.ts` (`pnpm --filter api migrate`) creates the schema on a fresh database.

## Structure

| Path | Purpose |
|------|---------|
| `apps/api` | GraphQL API (GraphQL Yoga) on Cloudflare Workers — schools/polls/votes/flames/friends/admin, Clerk auth, Neon Postgres, Upstash Redis |
| `apps/web` | Student + admin frontend, TanStack Start (SPA mode), TanStack Query, Clerk |
| `apps/mobile` | Native student app, Expo + Expo Router, NativeWind, Clerk |
| `packages/api-client` | Shared GraphQL data layer (`createGqlFetch`, query hooks) used by both `apps/web` and `apps/mobile` |

## Testing

```
pnpm turbo run test     # apps/api + apps/web
pnpm --filter api test  # apps/api only
pnpm --filter web test  # apps/web only
```

`apps/api`'s suite is real integration tests (`node:test`) against a disposable Neon branch — set `TEST_DATABASE_URL` in `apps/api/.dev.vars` to a second, throwaway branch (never your real `DATABASE_URL`; the suite drops and recreates every table on each run). `apps/web`'s suite is Vitest + React Testing Library. `apps/mobile` and `packages/api-client` don't have a test suite yet — `pnpm turbo run typecheck` covers all four.

## Admin dashboard

Sign in with a Clerk identity whose `publicMetadata.role` is `"admin"` (and whose session token has the `role` custom claim configured — see the Clerk dashboard's Sessions settings) to land on `/admin` instead of the student app. Covers schools, users, poll questions, vote moderation, and safety reports.
