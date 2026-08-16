import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useNotifications } from './useNotifications';

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

describe('useNotifications', () => {
  test('fetches notifications with the Clerk token', async () => {
    const notifications = [{ id: 'ntf_1', text: 'Welcome!', emoji: '🎉', ts: '2026-01-01T00:00:00Z', read: false }];
    gqlFetchMock.mockResolvedValue({ notifications });

    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(notifications);
    expect(gqlFetchMock).toHaveBeenCalledWith(expect.stringContaining('query Notifications'), undefined, 'a-real-token');
  });
});
