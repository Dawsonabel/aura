import { useAuth } from '@clerk/expo';
import { useActivateGodMode as useSharedActivateGodMode } from '@aura/api-client';
import { gqlFetch } from '../lib/graphql';

export function useActivateGodMode() {
  const { getToken } = useAuth();
  return useSharedActivateGodMode({ gqlFetch, getToken });
}
