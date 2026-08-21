import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useActivateInfiniteAura } from './useActivateInfiniteAura';

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

describe('useActivateInfiniteAura', () => {
  test('calls the legacyInfiniteAura mutation, defaulting to switching it on', async () => {
    gqlFetchMock.mockResolvedValue({ legacyInfiniteAura: true });
    const { result } = renderHook(() => useActivateInfiniteAura(), { wrapper });

    // Explicit `undefined` — the mutation takes a direction now, so React Query's `mutate` wants the
    // variables slot filled even when the value itself is the default.
    result.current.mutate(undefined);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(gqlFetchMock).toHaveBeenCalledWith(
      expect.stringContaining('mutation ActivateInfiniteAura'),
      { on: true },
      'a-real-token'
    );
  });

  /* The off direction is the whole reason this takes an argument: membership used to be a one-way
     door, so nobody who granted it could see the free experience again. */
  test('passes on: false through so membership can be switched back off', async () => {
    gqlFetchMock.mockResolvedValue({ legacyInfiniteAura: false });
    const { result } = renderHook(() => useActivateInfiniteAura(), { wrapper });

    result.current.mutate(false);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(gqlFetchMock).toHaveBeenCalledWith(
      expect.stringContaining('mutation ActivateInfiniteAura'),
      { on: false },
      'a-real-token'
    );
    expect(result.current.data).toBe(false);
  });
});
