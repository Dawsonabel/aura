import { useAuth } from '@clerk/expo';
import { useUpdateMe as useSharedUpdateMe, type UpdateMeInput } from '@aura/api-client';
import { gqlFetch } from '../lib/graphql';

export type { UpdateMeInput };

export function useUpdateMe() {
  const { getToken } = useAuth();
  return useSharedUpdateMe({ gqlFetch, getToken });
}
