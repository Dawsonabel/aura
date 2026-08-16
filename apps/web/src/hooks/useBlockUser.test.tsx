import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useBlockUser } from './useBlockUser';

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

describe('useBlockUser', () => {
  test('sends the userId and returns the updated blocked list', async () => {
    gqlFetchMock.mockResolvedValue({ block: ['usr_9'] });
    const { result } = renderHook(() => useBlockUser(), { wrapper });

    result.current.mutate('usr_9');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(gqlFetchMock).toHaveBeenCalledWith(expect.stringContaining('mutation Block'), { userId: 'usr_9' }, 'a-real-token');
  });
});
