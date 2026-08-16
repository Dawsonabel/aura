import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useCreatePoll } from './useCreatePoll';

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

describe('useCreatePoll', () => {
  test('sends emoji/text/color', async () => {
    gqlFetchMock.mockResolvedValue({ createPoll: { id: 'pol_1' } });
    const { result } = renderHook(() => useCreatePoll(), { wrapper });

    result.current.mutate({ emoji: '🎯', text: 'Test poll', color: '#123456' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(gqlFetchMock).toHaveBeenCalledWith(
      expect.stringContaining('mutation CreatePoll'),
      { emoji: '🎯', text: 'Test poll', color: '#123456' },
      'a-real-token'
    );
  });
});
