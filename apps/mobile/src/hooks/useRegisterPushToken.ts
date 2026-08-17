import { useAuth } from '@clerk/expo';
import { useRegisterPushToken as useSharedRegisterPushToken } from '@aura/api-client';
import { gqlFetch } from '../lib/graphql';

export function useRegisterPushToken() {
  const { getToken } = useAuth();
  return useSharedRegisterPushToken({ gqlFetch, getToken });
}
