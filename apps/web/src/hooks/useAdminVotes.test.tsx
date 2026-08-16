import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useAdminVotes } from './useAdminVotes';

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

describe('useAdminVotes', () => {
  test('fetches votes, passing the limit through', async () => {
    const votes = [{ id: 'vote_1', voterName: 'Alex Kim', targetName: 'Sam Lee', text: 'Best smile', ts: '2026-01-01T00:00:00Z' }];
    gqlFetchMock.mockResolvedValue({ votes });

    const { result } = renderHook(() => useAdminVotes(300), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(votes);
    expect(gqlFetchMock).toHaveBeenCalledWith(expect.stringContaining('query AdminVotes'), { limit: 300 }, 'a-real-token');
  });
});
