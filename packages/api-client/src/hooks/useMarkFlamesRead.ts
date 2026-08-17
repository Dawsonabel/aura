import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { GqlFetch } from '../client';

const MARK_FLAMES_READ_MUTATION = /* GraphQL */ `
  mutation MarkFlamesRead {
    markFlamesRead
  }
`;

export type UseMarkFlamesReadParams = {
  gqlFetch: GqlFetch;
  getToken: () => Promise<string | null | undefined>;
};

export function useMarkFlamesRead({ gqlFetch, getToken }: UseMarkFlamesReadParams) {
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
