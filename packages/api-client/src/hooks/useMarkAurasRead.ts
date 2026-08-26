import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { GqlFetch } from '../client';

const MARK_AURAS_READ_MUTATION = /* GraphQL */ `
  mutation MarkAurasRead {
    markAurasRead
  }
`;

export type UseMarkAurasReadParams = {
  gqlFetch: GqlFetch;
  getToken: () => Promise<string | null | undefined>;
};

export function useMarkAurasRead({ gqlFetch, getToken }: UseMarkAurasReadParams) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const { markAurasRead } = await gqlFetch<{ markAurasRead: boolean }>(MARK_AURAS_READ_MUTATION, undefined, token);
      return markAurasRead;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['auras'] })
  });
}
