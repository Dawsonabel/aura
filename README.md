# Aura

An anonymous school-scoped compliment/crush-matching app — students vote on compliment prompts about their classmates ("polls"), see who picked them ("flames"), and can spend coins or unlock God Mode to reveal hints about who it was.

GraphQL backend on Cloudflare Workers (`apps/api`) with a TanStack Start frontend (`apps/web`), Clerk for auth, Neon Postgres for storage, Upstash Redis for rate limiting and ephemeral poll-round state.

## Run it

Requires [Nix](https://nixos.org/) (the flake provides Node 24 + pnpm) or Node 24 + pnpm 11 installed some other way.

```
nix develop        # or: direnv allow, if you use direnv
pnpm install
```

Each app needs its own local env file:

- `apps/api/.dev.vars` — copy from `apps/api/.dev.vars.example`: a Neon `DATABASE_URL`, Upstash Redis REST credentials, a Clerk secret key.
- `apps/web/.env` — copy from `apps/web/.env.example`: a Clerk publishable key, and `VITE_API_URL` pointing at `apps/api`'s local dev URL.

Then, from the repo root:

```
pnpm dev            # runs apps/api (wrangler dev) and apps/web (vite dev) together, via Turborepo
```

`apps/api/scripts/migrate.ts` (`pnpm --filter api migrate`) creates the schema on a fresh database.

## Structure

| Path | Purpose |
|------|---------|
| `apps/api` | GraphQL API (GraphQL Yoga) on Cloudflare Workers — schools/polls/votes/flames/friends/admin, Clerk auth, Neon Postgres, Upstash Redis |
| `apps/web` | Student + admin frontend, TanStack Start (SPA mode), TanStack Query, Clerk |

## Testing

```
pnpm turbo run test     # both apps
pnpm --filter api test  # apps/api only
pnpm --filter web test  # apps/web only
```

`apps/api`'s suite is real integration tests (`node:test`) against a disposable Neon branch — set `TEST_DATABASE_URL` in `apps/api/.dev.vars` to a second, throwaway branch (never your real `DATABASE_URL`; the suite drops and recreates every table on each run). `apps/web`'s suite is Vitest + React Testing Library.

## Admin dashboard

Sign in with a Clerk identity whose `publicMetadata.role` is `"admin"` (and whose session token has the `role` custom claim configured — see the Clerk dashboard's Sessions settings) to land on `/admin` instead of the student app. Covers schools, users, poll questions, vote moderation, and safety reports.
