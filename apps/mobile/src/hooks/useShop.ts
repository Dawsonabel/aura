import { useAuth } from '@clerk/expo';
import { useShop as useSharedShop, type Shop } from '@aura/api-client';
import { gqlFetch } from '../lib/graphql';

export type { Shop };

export function useShop() {
  const { getToken, isSignedIn } = useAuth();
  return useSharedShop({ gqlFetch, getToken, enabled: isSignedIn === true });
}
