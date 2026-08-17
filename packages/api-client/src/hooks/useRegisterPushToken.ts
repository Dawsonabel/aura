import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { GqlFetch } from '../client';

const REGISTER_PUSH_TOKEN_MUTATION = /* GraphQL */ `
  mutation RegisterPushToken($token: String!, $tzOffsetMinutes: Int) {
    registerPushToken(token: $token, tzOffsetMinutes: $tzOffsetMinutes)
  }
`;

export type RegisterPushTokenInput = { token: string; tzOffsetMinutes?: number };

export type UseRegisterPushTokenParams = {
  gqlFetch: GqlFetch;
  getToken: () => Promise<string | null | undefined>;
};

/** Idempotent — the app calls this on every launch once permission is granted. */
export function useRegisterPushToken({ gqlFetch, getToken }: UseRegisterPushTokenParams) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: RegisterPushTokenInput) => {
      const token = await getToken();
      const { registerPushToken } = await gqlFetch<{ registerPushToken: boolean }>(
        REGISTER_PUSH_TOKEN_MUTATION,
        input,
        token
      );
      return registerPushToken;
    },
    // `me.pushEnabled` flips with the first registered device, and the prefs screen reads it.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] })
  });
}
