import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useAdminStats } from './useAdminStats';

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
  useAuthMock.mockReturnValue({ getToken: vi.fn().mockResolvedValue('a-real-token'), isSignedIn: true });
});

describe('useAdminStats', () => {
  test('fetches admin stats with the Clerk token', async () => {
    const stats = { schools: 2, users: 10, polls: 4, votes: 30, godMode: 1, reports: 0 };
    gqlFetchMock.mockResolvedValue({ adminStats: stats });

    const { result } = renderHook(() => useAdminStats(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(stats);
    expect(gqlFetchMock).toHaveBeenCalledWith(expect.stringContaining('query AdminStats'), undefined, 'a-real-token');
  });

  test('does not retry on failure (used as a fast admin/non-admin signal)', async () => {
    gqlFetchMock.mockRejectedValue(new Error('Admin only'));
    const { result } = renderHook(() => useAdminStats(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(gqlFetchMock).toHaveBeenCalledTimes(1);
  });
});
