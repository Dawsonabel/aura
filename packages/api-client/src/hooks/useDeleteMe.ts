import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { GqlFetch } from '../client';

const DELETE_ME_MUTATION = /* GraphQL */ `
  mutation DeleteMe {
    deleteMe
  }
`;

export type UseDeleteMeParams = {
  gqlFetch: GqlFetch;
  getToken: () => Promise<string | null | undefined>;
};

/* The Clerk session survives deleteMe (only the app-side row is gone) — invalidating ['me'] makes
   the next fetch re-trigger getOrCreateUserByClerkId's lazy-create, landing on a fresh unonboarded
   row. Callers navigate afterwards; each app's root route takes it from there. Behavior is covered
   by apps/api/test/account.test.ts.

   Note for the mobile delete-account screen: because the Clerk session survives, "delete" alone
   would drop the user straight back into onboarding as a brand-new row. That screen signs out
   after this resolves so the account is actually gone from the user's point of view. */
export function useDeleteMe({ gqlFetch, getToken }: UseDeleteMeParams) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const { deleteMe } = await gqlFetch<{ deleteMe: boolean }>(DELETE_ME_MUTATION, undefined, token);
      return deleteMe;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] })
  });
}
