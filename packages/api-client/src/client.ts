import { request } from 'graphql-request';

export type GqlFetch = <T>(query: string, variables?: Record<string, unknown>, token?: string | null) => Promise<T>;

export function createGqlFetch(apiUrl: string): GqlFetch {
  return (query, variables, token) =>
    request({
      url: apiUrl,
      document: query,
      variables,
      requestHeaders: token ? { Authorization: `Bearer ${token}` } : undefined
    });
}
