import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/tanstack-react-start';
import { gqlFetch } from '../lib/graphql';
import type { TuningDial } from './useTuningDials';

const UPDATE_TUNING_DIAL_MUTATION = /* GraphQL */ `
  mutation UpdateTuningDial($key: String!, $value: Int) {
    updateTuningDial(key: $key, value: $value) {
      key
      value
      default
      overridden
    }
  }
`;

/** value: null clears the override — the dial falls back to env/default. */
export type UpdateTuningDialInput = { key: string; value: number | null };

export function useUpdateTuningDial() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateTuningDialInput) => {
      const token = await getToken();
      const { updateTuningDial } = await gqlFetch<{ updateTuningDial: TuningDial[] }>(
        UPDATE_TUNING_DIAL_MUTATION,
        input,
        token
      );
      return updateTuningDial;
    },
    // The mutation returns the whole refreshed list, so the cache is set rather than invalidated —
    // one round trip, and the page repaints from the same response that confirmed the write.
    onSuccess: dials => queryClient.setQueryData(['tuningDials'], dials)
  });
}
