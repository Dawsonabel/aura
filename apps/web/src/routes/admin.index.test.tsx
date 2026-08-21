import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Overview } from './admin.index';

const { useAdminStatsMock } = vi.hoisted(() => ({ useAdminStatsMock: vi.fn() }));
vi.mock('@tanstack/react-router', () => ({ createFileRoute: () => (opts: unknown) => opts }));
vi.mock('../hooks/useAdminStats', () => ({ useAdminStats: useAdminStatsMock }));

beforeEach(() => useAdminStatsMock.mockReset());

describe('Overview', () => {
  test('renders each stat tile with its real count', () => {
    useAdminStatsMock.mockReturnValue({ data: { schools: 3, users: 42, polls: 7, votes: 200, infiniteAura: 5, reports: 1 } });
    render(<Overview />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('Open reports')).toBeInTheDocument();
  });
});
