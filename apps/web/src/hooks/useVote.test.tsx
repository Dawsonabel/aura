import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useVote } from './useVote';

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

describe('useVote', () => {
  test('sends questionId/targetId/roundId and returns ok/dup', async () => {
    gqlFetchMock.mockResolvedValue({ vote: { ok: true, dup: false } });
    const { result } = renderHook(() => useVote(), { wrapper });

    const input = { questionId: 'pol_1', targetId: 'usr_2', roundId: 'rnd_1' };
    result.current.mutate(input);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({ ok: true, dup: false });
    expect(gqlFetchMock).toHaveBeenCalledWith(expect.stringContaining('mutation Vote'), input, 'a-real-token');
  });
});
