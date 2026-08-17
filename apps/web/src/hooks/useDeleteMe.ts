import { useNavigate } from '@tanstack/react-router';
import { useAuth } from '@clerk/tanstack-react-start';
import { useDeleteMe as useSharedDeleteMe } from '@aura/api-client';
import { gqlFetch } from '../lib/graphql';

/* Navigating to `/` after the shared hook's cache invalidation lets the root route's existing
   redirect logic land the user on /onboarding with the fresh lazy-created row. */
export function useDeleteMe() {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const deleteMe = useSharedDeleteMe({ gqlFetch, getToken });

  return {
    ...deleteMe,
    mutate: (...args: Parameters<typeof deleteMe.mutate>) => {
      const [vars, opts] = args;
      return deleteMe.mutate(vars, {
        ...opts,
        onSuccess: (...cbArgs) => {
          opts?.onSuccess?.(...cbArgs);
          navigate({ to: '/' });
        }
      });
    }
  };
}
