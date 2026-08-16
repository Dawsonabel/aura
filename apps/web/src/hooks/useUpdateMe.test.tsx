import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useUpdateMe } from './useUpdateMe';

const { useAuthMock, gqlFetchMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  gqlFetchMock: vi.fn()
}));
vi.mock('@clerk/tanstack-react-start', () => ({ useAuth: useAuthMock }));
vi.mock('../lib/graphql', () => ({ gqlFetch: gqlFetchMock }));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  useAuthMock.mockReset();
  gqlFetchMock.mockReset();
  useAuthMock.mockReturnValue({ getToken: vi.fn().mockResolvedValue('a-real-token') });
});

describe('useUpdateMe', () => {
  test('sends the given fields with the Clerk token and returns the updated user', async () => {
    gqlFetchMock.mockResolvedValue({ updateMe: { id: 'usr_123', onboarded: false, age: 15 } });
    const { result } = renderHook(() => useUpdateMe(), { wrapper });

    result.current.mutate({ age: 15 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({ id: 'usr_123', onboarded: false, age: 15 });
    expect(gqlFetchMock).toHaveBeenCalledWith(expect.stringContaining('mutation UpdateMe'), { age: 15 }, 'a-real-token');
  });
});
