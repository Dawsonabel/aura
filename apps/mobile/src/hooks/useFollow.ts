import { useAuth } from '@clerk/expo';
import {
  useFollow as useSharedFollow,
  useFollowGrade as useSharedFollowGrade,
  useUnfollow as useSharedUnfollow
} from '@aura/api-client';
import { gqlFetch } from '../lib/graphql';

export function useFollow() {
  const { getToken } = useAuth();
  return useSharedFollow({ gqlFetch, getToken });
}

export function useUnfollow() {
  const { getToken } = useAuth();
  return useSharedUnfollow({ gqlFetch, getToken });
}

/** Bulk follow one grade — the People screen's "Follow all of 11th grade" row. */
export function useFollowGrade() {
  const { getToken } = useAuth();
  return useSharedFollowGrade({ gqlFetch, getToken });
}
