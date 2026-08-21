import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useAdminUsers } from './useAdminUsers';

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

describe('useAdminUsers', () => {
  test('fetches users, passing the schoolId filter through', async () => {
    const users = [{ id: 'usr_1', schoolId: 'sch_1', firstName: 'Alex', lastName: 'Kim', username: 'alexk', gender: 'girl', grade: '10', coins: 2, infiniteAura: false }];
    gqlFetchMock.mockResolvedValue({ users });

    const { result } = renderHook(() => useAdminUsers('sch_1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(users);
    expect(gqlFetchMock).toHaveBeenCalledWith(expect.stringContaining('query Users'), { schoolId: 'sch_1' }, 'a-real-token');
  });
});
