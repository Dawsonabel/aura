import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/tanstack-react-start';
import { gqlFetch } from '../lib/graphql';

const UPDATE_POLL_MUTATION = /* GraphQL */ `
  mutation UpdatePoll($id: ID!, $emoji: String, $text: String, $color: String, $enabled: Boolean, $schoolId: ID) {
    updatePoll(id: $id, emoji: $emoji, text: $text, color: $color, enabled: $enabled, schoolId: $schoolId) {
      id
      enabled
    }
  }
`;

export type UpdatePollInput = { id: string; emoji?: string; text?: string; color?: string; enabled?: boolean; schoolId?: string };

export function useUpdatePoll() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdatePollInput) => {
      const token = await getToken();
      const { updatePoll } = await gqlFetch<{ updatePoll: unknown }>(UPDATE_POLL_MUTATION, input, token);
      return updatePoll;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adminPolls'] })
  });
}
