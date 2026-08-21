import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Home } from './index';

const { showMock, useMeMock, useAdminStatsMock, navigateMock } = vi.hoisted(() => ({
  showMock: vi.fn(),
  useMeMock: vi.fn(),
  useAdminStatsMock: vi.fn(),
  navigateMock: vi.fn()
}));

vi.mock('@clerk/tanstack-react-start', () => ({
  Show: (props: { when: 'signed-in' | 'signed-out'; children: React.ReactNode }) => showMock(props)
}));
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/sign-in">{children}</a>,
  useNavigate: () => navigateMock,
  // Home is imported directly (not via the route tree) — the module-scope `createFileRoute('/')(...)`
  // call still runs on import, so it needs a harmless stub, not a real router.
  createFileRoute: () => (opts: unknown) => opts
}));
vi.mock('../hooks/useMe', () => ({ useMe: useMeMock }));
vi.mock('../hooks/useAdminStats', () => ({ useAdminStats: useAdminStatsMock }));

beforeEach(() => {
  showMock.mockReset();
  useMeMock.mockReset();
  useAdminStatsMock.mockReset();
  navigateMock.mockReset();
  useMeMock.mockReturnValue({ data: undefined, isLoading: false, error: null });
  useAdminStatsMock.mockReturnValue({ data: undefined, isError: false });
});

describe('Home', () => {
  test('signed out: renders the sign-in link, does not navigate', () => {
    showMock.mockImplementation(({ when, children }) => (when === 'signed-out' ? children : null));
    render(<Home />);
    expect(screen.getByText('Sign in')).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  test('signed in and onboarded: redirects to /aura', () => {
    showMock.mockImplementation(({ when, children }) => (when === 'signed-in' ? children : null));
    useMeMock.mockReturnValue({ data: { id: 'usr_123', onboarded: true }, isLoading: false, error: null });
    render(<Home />);
    expect(navigateMock).toHaveBeenCalledWith({ to: '/aura' });
  });

  test('signed in but not onboarded: redirects to /onboarding', () => {
    showMock.mockImplementation(({ when, children }) => (when === 'signed-in' ? children : null));
    useMeMock.mockReturnValue({ data: { id: 'usr_123', onboarded: false }, isLoading: false, error: null });
    render(<Home />);
    expect(navigateMock).toHaveBeenCalledWith({ to: '/onboarding' });
  });

  test('signed in as an admin (no `me` row, adminStats succeeds instead): redirects to /admin', () => {
    showMock.mockImplementation(({ when, children }) => (when === 'signed-in' ? children : null));
    useMeMock.mockReturnValue({ data: undefined, isLoading: false, error: new Error('Not logged in') });
    useAdminStatsMock.mockReturnValue({ data: { schools: 1, users: 1, polls: 1, votes: 1, infiniteAura: 0, reports: 0 }, isError: false });
    render(<Home />);
    expect(navigateMock).toHaveBeenCalledWith({ to: '/admin' });
  });
});
