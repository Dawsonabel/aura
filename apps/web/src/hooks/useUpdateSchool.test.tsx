import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useUpdateSchool } from './useUpdateSchool';

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

describe('useUpdateSchool', () => {
  test('sends id and changed fields', async () => {
    gqlFetchMock.mockResolvedValue({ updateSchool: { id: 'sch_1', city: 'New City' } });
    const { result } = renderHook(() => useUpdateSchool(), { wrapper });

    result.current.mutate({ id: 'sch_1', city: 'New City' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(gqlFetchMock).toHaveBeenCalledWith(expect.stringContaining('mutation UpdateSchool'), { id: 'sch_1', city: 'New City' }, 'a-real-token');
  });
});
