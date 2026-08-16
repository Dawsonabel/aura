import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useDeleteMe } from './useDeleteMe';

const { useAuthMock, gqlFetchMock, navigateMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  gqlFetchMock: vi.fn(),
  navigateMock: vi.fn()
}));
vi.mock('@clerk/tanstack-react-start', () => ({ useAuth: useAuthMock }));
vi.mock('../lib/graphql', () => ({ gqlFetch: gqlFetchMock }));
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigateMock }));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  useAuthMock.mockReset();
  gqlFetchMock.mockReset();
  navigateMock.mockReset();
  useAuthMock.mockReturnValue({ getToken: vi.fn().mockResolvedValue('a-real-token') });
});

describe('useDeleteMe', () => {
  test('calls the mutation and navigates to / on success', async () => {
    gqlFetchMock.mockResolvedValue({ deleteMe: true });
    const { result } = renderHook(() => useDeleteMe(), { wrapper });

    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(gqlFetchMock).toHaveBeenCalledWith(expect.stringContaining('mutation DeleteMe'), undefined, 'a-real-token');
    expect(navigateMock).toHaveBeenCalledWith({ to: '/' });
  });
});
