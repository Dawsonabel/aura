import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/tanstack-react-start';
import { gqlFetch } from '../lib/graphql';

const SUGGESTIONS_QUERY = /* GraphQL */ `
  query Suggestions {
    suggestions {
      contacts {
        id
        firstName
        lastName
        grade
      }
      fof {
        id
        firstName
        lastName
        grade
      }
    }
  }
`;

export type SuggestedUser = { id: string; firstName: string | null; lastName: string | null; grade: string | null };
export type Suggestions = { contacts: SuggestedUser[]; fof: SuggestedUser[] };

type Response = { suggestions: Suggestions };

export function useSuggestions() {
  const { getToken, isSignedIn } = useAuth();

  return useQuery({
    queryKey: ['suggestions'],
    queryFn: async () => {
      const token = await getToken();
      const { suggestions } = await gqlFetch<Response>(SUGGESTIONS_QUERY, undefined, token);
      return suggestions;
    },
    enabled: isSignedIn === true
  });
}
