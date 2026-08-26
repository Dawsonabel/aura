import { request } from 'graphql-request';

export type GqlFetch = <T>(query: string, variables?: Record<string, unknown>, token?: string | null) => Promise<T>;

/* graphql-request throws a ClientError whose `.message` is the operation name followed by the
   whole serialized response — headers, the full query text, the lot. Anything that renders
   `error.message` (every screen in both apps) therefore shows a wall of JSON instead of the
   deliberately user-facing strings apps/api throws ("Not logged in", "You must be at least 13 to
   use Aura.", ...). apps/api goes out of its way to preserve those via its maskError config; this
   is the other half of that contract, unwrapping them again on the client.

   Falls back to the original error whenever the shape isn't recognised, so nothing is swallowed. */
function unwrapGraphQLError(e: unknown): never {
  const response = (e as { response?: { errors?: { message?: string }[] } })?.response;
  const first = response?.errors?.[0]?.message;
  if (typeof first === 'string' && first.length > 0) throw new Error(first);
  throw e;
}

export function createGqlFetch(apiUrl: string): GqlFetch {
  return (query, variables, token) =>
    request({
      url: apiUrl,
      document: query,
      variables,
      requestHeaders: token ? { Authorization: `Bearer ${token}` } : undefined
    }).catch(unwrapGraphQLError);
}
