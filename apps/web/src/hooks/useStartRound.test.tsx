import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useStartRound } from './useStartRound';

const { useAuthMock, gqlFetchMock } = vi.hoisted(() => ({ useAuthMock: vi.fn(), gqlFetchMock: vi.fn() }));
vi.mock('@clerk/tanstack-react-start', () => ({ useAuth: useAuthMock }));
vi.mock('../lib/graphql', () => ({ gqlFetch: gqlFetchMock }));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  useAuthMock.mockReset();
  gqlFetchMock.mockReset();
  useAuthMock.mockReturnValue({ getToken: vi.fn().mockResolvedValue('a-real-token') });
});

describe('useStartRound', () => {
  test('fetches a fresh round with the Clerk token', async () => {
    const round = { roundId: 'rnd_1', canPlay: true, polls: [{ questionId: 'pol_1', emoji: '🔥', text: 'q', color: '#000', choices: [] }] };
    gqlFetchMock.mockResolvedValue({ pollRound: round });

    const { result } = renderHook(() => useStartRound(), { wrapper });
    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(round);
    expect(gqlFetchMock).toHaveBeenCalledWith(expect.stringContaining('query PollRound'), undefined, 'a-real-token');
  });
});
