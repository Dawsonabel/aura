import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GqlFetch } from '../client';
import type { Socials } from '../socials';

/* 13A's Profile data: your own trophy chips, someone else's public profile, and the handle-availability
   check the edit sheet needs. */

const SUPERLATIVE_FIELDS = `emoji text color count`;

const MY_SUPERLATIVES_QUERY = /* GraphQL */ `
  query MySuperlatives {
    mySuperlatives { ${SUPERLATIVE_FIELDS} }
  }
`;

const PUBLIC_PROFILE_QUERY = /* GraphQL */ `
  query PublicProfile($userId: ID!) {
    publicProfile(userId: $userId) {
      id
      name
      username
      grade
      gender
      schoolName
      flames
      rank
      blocked
      superlatives { ${SUPERLATIVE_FIELDS} }
      socials { instagram snapchat tiktok spotify }
    }
  }
`;

const USERNAME_AVAILABLE_QUERY = /* GraphQL */ `
  query UsernameAvailable($username: String!) {
    usernameAvailable(username: $username)
  }
`;

export type Superlative = { emoji: string; text: string; color: string; count: number };

export type PublicProfile = {
  id: string;
  /** "Blocked" when either of you blocked the other — the numbers stay true, the identity doesn't. */
  name: string;
  username: string | null;
  grade: string | null;
  gender: string | null;
  schoolName: string | null;
  flames: number;
  /** Null while the school's board is still locked, so this can't disagree with the Ranks tab. */
  rank: number | null;
  blocked: boolean;
  superlatives: Superlative[];
  socials: Socials;
};

type Params = { gqlFetch: GqlFetch; getToken: () => Promise<string | null | undefined> };

export function useMySuperlatives({ gqlFetch, getToken, enabled = true }: Params & { enabled?: boolean }) {
  return useQuery({
    queryKey: ['mySuperlatives'],
    queryFn: async () => {
      const token = await getToken();
      const { mySuperlatives } = await gqlFetch<{ mySuperlatives: Superlative[] }>(MY_SUPERLATIVES_QUERY, undefined, token);
      return mySuperlatives;
    },
    enabled
  });
}

export function usePublicProfile({ gqlFetch, getToken, userId, enabled = true }: Params & { userId: string; enabled?: boolean }) {
  return useQuery({
    queryKey: ['publicProfile', userId],
    queryFn: async () => {
      const token = await getToken();
      const { publicProfile } = await gqlFetch<{ publicProfile: PublicProfile | null }>(
        PUBLIC_PROFILE_QUERY,
        { userId },
        token
      );
      return publicProfile;
    },
    enabled: enabled && userId.length > 0
  });
}

/* A mutation rather than a query: it's driven by typing, and useMutation gives an explicit
   "check this now" call without a queryKey per keystroke filling the cache with dead entries. */
export function useCheckUsername({ gqlFetch, getToken }: Params) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (username: string) => {
      const token = await getToken();
      const { usernameAvailable } = await gqlFetch<{ usernameAvailable: boolean }>(
        USERNAME_AVAILABLE_QUERY,
        { username },
        token
      );
      return usernameAvailable;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['me'], exact: true, refetchType: 'none' })
  });
}
