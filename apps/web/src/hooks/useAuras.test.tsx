import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useAuras } from './useAuras';

const { useAuthMock, gqlFetchMock } = vi.hoisted(() => ({ useAuthMock: vi.fn(), gqlFetchMock: vi.fn() }));
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

describe('useAuras', () => {
  test('fetches auras with the Clerk token when signed in', async () => {
    useAuthMock.mockReturnValue({ getToken: vi.fn().mockResolvedValue('a-real-token'), isSignedIn: true });
    const result_ = { auras: [], coins: 2, infiniteAura: false };
    gqlFetchMock.mockResolvedValue({ auras: result_ });

    const { result } = renderHook(() => useAuras(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(result_);
    expect(gqlFetchMock).toHaveBeenCalledWith(expect.stringContaining('query Auras'), undefined, 'a-real-token');
  });

  test('does not fetch when signed out', () => {
    useAuthMock.mockReturnValue({ getToken: vi.fn(), isSignedIn: false });
    const { result } = renderHook(() => useAuras(), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(gqlFetchMock).not.toHaveBeenCalled();
  });
});
