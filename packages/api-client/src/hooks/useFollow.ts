import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { GqlFetch } from '../client';

/* Following is one-directional and needs no approval, so there is no request/accept state to model —
   the mutation either adds the edge or removes it. */

const FOLLOW_MUTATION = /* GraphQL */ `
  mutation Follow($userId: ID!) {
    follow(userId: $userId)
  }
`;

const UNFOLLOW_MUTATION = /* GraphQL */ `
  mutation Unfollow($userId: ID!) {
    unfollow(userId: $userId)
  }
`;

const FOLLOW_GRADE_MUTATION = /* GraphQL */ `
  mutation FollowGrade($grade: String!) {
    followGrade(grade: $grade)
  }
`;

export type UseFollowParams = {
  gqlFetch: GqlFetch;
  getToken: () => Promise<string | null | undefined>;
};

function invalidateFollowState(queryClient: ReturnType<typeof useQueryClient>) {
  /* `me` carries the follow list the UI renders buttons from, and the round's candidate weighting
     changes the moment an edge does — so a stale round would keep showing the old mix. */
  queryClient.invalidateQueries({ queryKey: ['me'] });
  queryClient.invalidateQueries({ queryKey: ['friends'] });
  queryClient.invalidateQueries({ queryKey: ['suggestions'] });
}

export function useFollow({ gqlFetch, getToken }: UseFollowParams) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const token = await getToken();
      const { follow } = await gqlFetch<{ follow: string[] }>(FOLLOW_MUTATION, { userId }, token);
      return follow;
    },
    onSuccess: () => invalidateFollowState(queryClient)
  });
}

/* "Follow all of 11th grade" — one call, not one per person. Already-followed and blocked people are
   skipped server-side, so this is safe to tap twice. */
export function useFollowGrade({ gqlFetch, getToken }: UseFollowParams) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (grade: string) => {
      const token = await getToken();
      const { followGrade } = await gqlFetch<{ followGrade: string[] }>(FOLLOW_GRADE_MUTATION, { grade }, token);
      return followGrade;
    },
    onSuccess: () => invalidateFollowState(queryClient)
  });
}

export function useUnfollow({ gqlFetch, getToken }: UseFollowParams) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const token = await getToken();
      const { unfollow } = await gqlFetch<{ unfollow: string[] }>(UNFOLLOW_MUTATION, { userId }, token);
      return unfollow;
    },
    onSuccess: () => invalidateFollowState(queryClient)
  });
}
