import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useAddFriend } from './useAddFriend';

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

describe('useAddFriend', () => {
  test('sends the userId and returns the updated friendIds', async () => {
    gqlFetchMock.mockResolvedValue({ addFriend: ['usr_1', 'usr_2'] });
    const { result } = renderHook(() => useAddFriend(), { wrapper });

    result.current.mutate('usr_2');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(['usr_1', 'usr_2']);
    expect(gqlFetchMock).toHaveBeenCalledWith(expect.stringContaining('mutation AddFriend'), { userId: 'usr_2' }, 'a-real-token');
  });
});
