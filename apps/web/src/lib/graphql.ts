import { createGqlFetch } from '@aura/api-client';

export const gqlFetch = createGqlFetch(import.meta.env.VITE_API_URL as string);
