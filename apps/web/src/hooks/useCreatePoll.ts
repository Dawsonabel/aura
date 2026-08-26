import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/tanstack-react-start';
import { gqlFetch } from '../lib/graphql';

const CREATE_POLL_MUTATION = /* GraphQL */ `
  mutation CreatePoll($emoji: String!, $text: String!, $color: String!, $schoolId: ID, $enabled: Boolean) {
    createPoll(emoji: $emoji, text: $text, color: $color, schoolId: $schoolId, enabled: $enabled) {
      id
    }
  }
`;

export type CreatePollInput = { emoji: string; text: string; color: string; schoolId?: string; enabled?: boolean };

export function useCreatePoll() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreatePollInput) => {
      const token = await getToken();
      const { createPoll } = await gqlFetch<{ createPoll: unknown }>(CREATE_POLL_MUTATION, input, token);
      return createPoll;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adminPolls'] })
  });
}
