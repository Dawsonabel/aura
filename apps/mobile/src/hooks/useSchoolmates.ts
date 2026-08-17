import { useAuth } from '@clerk/expo';
import { useSchoolmates as useSharedSchoolmates, type Schoolmate } from '@aura/api-client';
import { gqlFetch } from '../lib/graphql';

export type { Schoolmate };

export function useSchoolmates() {
  const { getToken, isSignedIn } = useAuth();
  return useSharedSchoolmates({ gqlFetch, getToken, enabled: isSignedIn === true });
}
