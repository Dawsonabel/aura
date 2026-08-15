import { request } from 'graphql-request';

const API_URL = import.meta.env.VITE_API_URL as string;

export function gqlFetch<T>(query: string, variables?: Record<string, unknown>, token?: string | null): Promise<T> {
  return request<T>({
    url: API_URL,
    document: query,
    variables,
    requestHeaders: token ? { Authorization: `Bearer ${token}` } : undefined
  });
}
