import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useAdminPolls } from './useAdminPolls';

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

describe('useAdminPolls', () => {
  test('fetches the admin poll list', async () => {
    const polls = [{ id: 'pol_1', emoji: '🎯', text: 'Test poll', color: '#123456', enabled: true, schoolId: null }];
    gqlFetchMock.mockResolvedValue({ polls });

    const { result } = renderHook(() => useAdminPolls(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(polls);
    expect(gqlFetchMock).toHaveBeenCalledWith(expect.stringContaining('query AdminPolls'), undefined, 'a-real-token');
  });
});
