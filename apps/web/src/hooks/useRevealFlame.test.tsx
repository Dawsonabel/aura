import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useRevealFlame } from './useRevealFlame';

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

describe('useRevealFlame', () => {
  test('sends the flame id and returns ok/coins', async () => {
    gqlFetchMock.mockResolvedValue({ revealFlame: { ok: true, coins: 1 } });
    const { result } = renderHook(() => useRevealFlame(), { wrapper });

    result.current.mutate('vote_1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({ ok: true, coins: 1 });
    expect(gqlFetchMock).toHaveBeenCalledWith(expect.stringContaining('mutation RevealFlame'), { id: 'vote_1' }, 'a-real-token');
  });
});
