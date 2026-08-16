import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/tanstack-react-start';
import { gqlFetch } from '../lib/graphql';

const MARK_FLAMES_READ_MUTATION = /* GraphQL */ `
  mutation MarkFlamesRead {
    markFlamesRead
  }
`;

export function useMarkFlamesRead() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const { markFlamesRead } = await gqlFetch<{ markFlamesRead: boolean }>(MARK_FLAMES_READ_MUTATION, undefined, token);
      return markFlamesRead;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['flames'] })
  });
}
