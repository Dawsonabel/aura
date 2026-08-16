import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useAdminReports } from './useAdminReports';

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

describe('useAdminReports', () => {
  test('fetches the reports list', async () => {
    const reports = [{ id: 'rep_1', byName: 'Alex Kim', targetName: 'Sam Lee', reason: 'spam', status: 'open', ts: '2026-01-01T00:00:00Z' }];
    gqlFetchMock.mockResolvedValue({ reports });

    const { result } = renderHook(() => useAdminReports(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(reports);
    expect(gqlFetchMock).toHaveBeenCalledWith(expect.stringContaining('query AdminReports'), undefined, 'a-real-token');
  });
});
