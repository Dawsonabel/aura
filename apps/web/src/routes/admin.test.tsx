import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminLayout } from './admin';

const { useAuthMock, useAdminStatsMock, navigateMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  useAdminStatsMock: vi.fn(),
  navigateMock: vi.fn()
}));

vi.mock('@clerk/tanstack-react-start', () => ({ useAuth: useAuthMock }));
vi.mock('../hooks/useAdminStats', () => ({ useAdminStats: useAdminStatsMock }));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (opts: unknown) => opts,
  Outlet: () => <div data-testid="outlet" />,
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useNavigate: () => navigateMock
}));

beforeEach(() => {
  useAuthMock.mockReset();
  useAdminStatsMock.mockReset();
  navigateMock.mockReset();
});

describe('AdminLayout', () => {
  test('signed out: redirects to /', () => {
    useAuthMock.mockReturnValue({ isSignedIn: false });
    useAdminStatsMock.mockReturnValue({ data: undefined, isError: false });
    render(<AdminLayout />);
    expect(navigateMock).toHaveBeenCalledWith({ to: '/' });
  });

  test('signed in but not admin (adminStats errors): redirects to /', () => {
    useAuthMock.mockReturnValue({ isSignedIn: true });
    useAdminStatsMock.mockReturnValue({ data: undefined, isError: true });
    render(<AdminLayout />);
    expect(navigateMock).toHaveBeenCalledWith({ to: '/' });
  });

  test('confirmed admin: renders the nav and outlet, does not navigate away', () => {
    useAuthMock.mockReturnValue({ isSignedIn: true });
    useAdminStatsMock.mockReturnValue({ data: { schools: 1, users: 1, polls: 1, votes: 1, godMode: 0, reports: 0 }, isError: false });
    render(<AdminLayout />);
    expect(screen.getByText('Aura Admin')).toBeInTheDocument();
    expect(screen.getByTestId('outlet')).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
