import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/tanstack-react-start';
import { gqlFetch } from '../lib/graphql';

const TUNING_DIALS_QUERY = /* GraphQL */ `
  query TuningDials {
    tuningDials {
      key
      value
      default
      overridden
    }
  }
`;

export type TuningDial = { key: string; value: number; default: number; overridden: boolean };
type Response = { tuningDials: TuningDial[] };

export function useTuningDials() {
  const { getToken, isSignedIn } = useAuth();

  return useQuery({
    queryKey: ['tuningDials'],
    queryFn: async () => {
      const token = await getToken();
      const { tuningDials } = await gqlFetch<Response>(TUNING_DIALS_QUERY, undefined, token);
      return tuningDials;
    },
    enabled: isSignedIn === true
  });
}
