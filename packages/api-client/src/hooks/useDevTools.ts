import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { GqlFetch } from '../client';

/* The dev-tools mutations, as one hook.

   One hook rather than six because they are one feature — a row of buttons on a screen that only
   exists in development — and six near-identical files would be six things to keep in step for no
   gain. Each action is a `kind` on the same mutation, so the caller does `devTools.mutate({ kind:
   'seedVotes', count: 20 })`.

   Every one of them rewrites state that most of the app is reading, so rather than curating which
   queries each action touches, all of them invalidate the same broad set. Getting that mapping wrong
   is the classic way a dev tool "doesn't work" — the row changed in Postgres and the screen kept
   showing a cached copy, which sends you debugging the mutation instead of the cache. Over-
   invalidating costs a few refetches on a screen nobody ships.

   The server gate is the real one (AURA_DEV_TOOLS, see apps/api/src/devTools.ts). This is a client,
   so it can't enforce anything — callers render it behind `__DEV__`. */

const DEV_TOOLS_MUTATION = /* GraphQL */ `
  mutation DevTools(
    $resetFlips: Boolean!
    $seedVotes: Boolean!
    $anonymousVote: Boolean!
    $seedFriendActivity: Boolean!
    $clearCards: Boolean!
    $grantSparks: Boolean!
    $resetRounds: Boolean!
    $setStreak: Boolean!
    $count: Int
    $amount: Int
    $days: Int!
  ) {
    devResetFlips @include(if: $resetFlips) {
      ok
      message
    }
    devSeedVotes(count: $count) @include(if: $seedVotes) {
      ok
      message
    }
    devAnonymousVote @include(if: $anonymousVote) {
      ok
      message
    }
    devSeedFriendActivity(count: $count) @include(if: $seedFriendActivity) {
      ok
      message
    }
    devClearCards @include(if: $clearCards) {
      ok
      message
    }
    devGrantSparks(amount: $amount) @include(if: $grantSparks) {
      ok
      message
    }
    devResetRounds @include(if: $resetRounds) {
      ok
      message
    }
    devSetStreak(days: $days) @include(if: $setStreak) {
      ok
      message
    }
  }
`;

export type DevToolKind =
  | 'resetFlips'
  | 'seedVotes'
  | 'anonymousVote'
  | 'seedFriendActivity'
  | 'clearCards'
  | 'grantSparks'
  | 'resetRounds'
  | 'setStreak';

export type DevToolAction = {
  kind: DevToolKind;
  /** seedVotes: how many to create (clamped 1–40, default 8). seedFriendActivity: same, 1–30/9. */
  count?: number;
  /** grantSparks: how many to add (negative removes). Server clamps to ±10,000. */
  amount?: number;
  /** setStreak: the day to set the run to. */
  days?: number;
};

export type DevResult = { ok: boolean; message: string };

export type UseDevToolsParams = {
  gqlFetch: GqlFetch;
  getToken: () => Promise<string | null | undefined>;
};

export function useDevTools({ gqlFetch, getToken }: UseDevToolsParams) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (action: DevToolAction): Promise<DevResult> => {
      const token = await getToken();
      /* `@include(if:)` picks the one field to run. The alternative — six mutation documents, or
         string-building one per call — either duplicates the file six times or gives up on having a
         static document at all. The unused branches are not executed server-side; they aren't even
         resolved. */
      const data = await gqlFetch<Record<string, DevResult | undefined>>(
        DEV_TOOLS_MUTATION,
        {
          resetFlips: action.kind === 'resetFlips',
          seedVotes: action.kind === 'seedVotes',
          anonymousVote: action.kind === 'anonymousVote',
          seedFriendActivity: action.kind === 'seedFriendActivity',
          clearCards: action.kind === 'clearCards',
          grantSparks: action.kind === 'grantSparks',
          resetRounds: action.kind === 'resetRounds',
          setStreak: action.kind === 'setStreak',
          count: action.count ?? null,
          amount: action.amount ?? null,
          /* Non-null in the schema because a streak of 0 is a meaningful value (clear it), so the
             argument can't use null-means-default. Every other call still has to send *something*. */
          days: action.days ?? 0
        },
        token
      );
      const key = `dev${action.kind.charAt(0).toUpperCase()}${action.kind.slice(1)}`;
      return data[key] ?? { ok: false, message: 'No response' };
    },
    onSuccess: () => {
      /* Real query keys only — an invented one invalidates nothing and fails silently, which would
         look exactly like the mutation not working. Prefix matches, so parameterised keys like
         ['board', scope] are covered by ['board'].

         The Aura round is not in this list because it isn't a query: useAuraRound starts rounds
         through a deliberate raw Effect (startRound is non-idempotent — see CLAUDE.md), so there is
         no cache entry for `devResetRounds` to invalidate. Leaving and re-entering the tab is what
         picks up the refilled allowance. */
      for (const key of [
        'me',
        'auras',
        'notifications',
        'board',
        'mySuperlatives',
        'shop',
        // seedFriendActivity writes both — a new friend, and picks for them to have received.
        'friends',
        'friendActivity'
      ]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
    }
  });
}
