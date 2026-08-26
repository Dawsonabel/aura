import { useSchools as useSharedSchools, type School } from '@aura/api-client';
import { gqlFetch } from '../lib/graphql';

export type { School };

export function useSchools() {
  return useSharedSchools({ gqlFetch });
}
