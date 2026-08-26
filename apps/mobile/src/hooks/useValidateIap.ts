import { useAuth } from '@clerk/expo';
import { useValidateIap as useSharedValidateIap, type ValidateIapResult } from '@aura/api-client';
import { gqlFetch } from '../lib/graphql';

export type { ValidateIapResult };

export function useValidateIap() {
  const { getToken } = useAuth();
  return useSharedValidateIap({ gqlFetch, getToken });
}
