import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useAuth } from '@clerk/tanstack-react-start';
import { gqlFetch } from '../lib/graphql';

const DELETE_ME_MUTATION = /* GraphQL */ `
  mutation DeleteMe {
    deleteMe
  }
`;

/* The Clerk session survives deleteMe (only the app-side row is gone) — invalidating ['me'] makes
   the next fetch re-trigger getOrCreateUserByClerkId's lazy-create, landing on a fresh unonboarded
   row. Navigating to `/` lets its existing redirect logic take it from there to /onboarding —
   exactly the behavior already covered by apps/api/test/account.test.ts. */
export function useDeleteMe() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const { deleteMe } = await gqlFetch<{ deleteMe: boolean }>(DELETE_ME_MUTATION, undefined, token);
      return deleteMe;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] });
      navigate({ to: '/' });
    }
  });
}
