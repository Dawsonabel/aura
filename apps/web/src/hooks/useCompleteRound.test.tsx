import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useCompleteRound } from './useCompleteRound';

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

describe('useCompleteRound', () => {
  test('sends roundId and returns coins/earned/already', async () => {
    gqlFetchMock.mockResolvedValue({ completeRound: { coins: 4, earned: 2, already: false } });
    const { result } = renderHook(() => useCompleteRound(), { wrapper });

    result.current.mutate('rnd_1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({ coins: 4, earned: 2, already: false });
    expect(gqlFetchMock).toHaveBeenCalledWith(expect.stringContaining('mutation CompleteRound'), { roundId: 'rnd_1' }, 'a-real-token');
  });
});
