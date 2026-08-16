import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useCreateSchool } from './useCreateSchool';

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

describe('useCreateSchool', () => {
  test('sends name/city', async () => {
    gqlFetchMock.mockResolvedValue({ createSchool: { id: 'sch_1', name: 'Test High', city: 'Testville' } });
    const { result } = renderHook(() => useCreateSchool(), { wrapper });

    result.current.mutate({ name: 'Test High', city: 'Testville' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(gqlFetchMock).toHaveBeenCalledWith(
      expect.stringContaining('mutation CreateSchool'),
      { name: 'Test High', city: 'Testville' },
      'a-real-token'
    );
  });
});
