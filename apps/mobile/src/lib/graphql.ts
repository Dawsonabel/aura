import { createGqlFetch } from '@aura/api-client';

export const gqlFetch = createGqlFetch(process.env.EXPO_PUBLIC_API_URL as string);
