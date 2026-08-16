import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useBoostRandom } from './useBoostRandom';

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

describe('useBoostRandom', () => {
  test('calls the mutation and returns coins/message', async () => {
    gqlFetchMock.mockResolvedValue({ boostRandom: { coins: 0, message: "You'll appear in 3 random polls 🔥" } });
    const { result } = renderHook(() => useBoostRandom(), { wrapper });

    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(gqlFetchMock).toHaveBeenCalledWith(expect.stringContaining('mutation BoostRandom'), undefined, 'a-real-token');
  });
});
