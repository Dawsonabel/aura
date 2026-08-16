import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useMe } from './useMe';

const { useAuthMock, gqlFetchMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  gqlFetchMock: vi.fn()
}));
vi.mock('@clerk/tanstack-react-start', () => ({ useAuth: useAuthMock }));
vi.mock('../lib/graphql', () => ({ gqlFetch: gqlFetchMock }));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  useAuthMock.mockReset();
  gqlFetchMock.mockReset();
});

describe('useMe', () => {
  test('does not fetch when signed out', async () => {
    useAuthMock.mockReturnValue({ getToken: vi.fn(), isSignedIn: false });
    const { result } = renderHook(() => useMe(), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(gqlFetchMock).not.toHaveBeenCalled();
  });

  test('fetches with the Clerk token and returns `me` when signed in', async () => {
    const getToken = vi.fn().mockResolvedValue('a-real-token');
    useAuthMock.mockReturnValue({ getToken, isSignedIn: true });
    gqlFetchMock.mockResolvedValue({ me: { id: 'usr_123', coins: 2, onboarded: false } });

    const { result } = renderHook(() => useMe(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({ id: 'usr_123', coins: 2, onboarded: false });
    expect(gqlFetchMock).toHaveBeenCalledWith(expect.stringContaining('query Me'), undefined, 'a-real-token');
  });
});
