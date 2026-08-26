import { useAuth } from '@clerk/tanstack-react-start';
import { useMe as useSharedMe } from '@aura/api-client';
import { gqlFetch } from '../lib/graphql';

export function useMe() {
  const { getToken, isSignedIn } = useAuth();
  return useSharedMe({ gqlFetch, getToken, enabled: isSignedIn === true });
}
