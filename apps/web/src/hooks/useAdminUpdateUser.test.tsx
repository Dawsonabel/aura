import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useAdminUpdateUser } from './useAdminUpdateUser';

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

describe('useAdminUpdateUser', () => {
  test('sends the given fields for the given user id', async () => {
    gqlFetchMock.mockResolvedValue({ adminUpdateUser: { id: 'usr_1', coins: 999 } });
    const { result } = renderHook(() => useAdminUpdateUser(), { wrapper });

    result.current.mutate({ id: 'usr_1', coins: 999 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(gqlFetchMock).toHaveBeenCalledWith(expect.stringContaining('mutation AdminUpdateUser'), { id: 'usr_1', coins: 999 }, 'a-real-token');
  });
});
