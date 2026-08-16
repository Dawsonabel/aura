import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TabHeader } from './TabHeader';

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigateMock }));

beforeEach(() => navigateMock.mockReset());

describe('TabHeader', () => {
  test('middle tab shows both neighbors, current tab centered', () => {
    render(<TabHeader current="gas" />);
    expect(screen.getByText('Inbox')).toBeInTheDocument();
    expect(screen.getByText('Gas')).toBeInTheDocument();
    expect(screen.getByText('Profile')).toBeInTheDocument();
  });

  test('first tab has no previous neighbor', () => {
    render(<TabHeader current="add" />);
    expect(screen.queryByRole('button', { name: /add/i })).not.toBeInTheDocument(); // no button for a missing prev slot
    expect(screen.getByText('Inbox')).toBeInTheDocument();
  });

  test('tapping a neighbor navigates to its route', () => {
    render(<TabHeader current="gas" />);
    fireEvent.click(screen.getByText('Inbox'));
    expect(navigateMock).toHaveBeenCalledWith({ to: '/inbox' });
  });

  test('shows the unread count badge on the Inbox slot when Inbox is a neighbor', () => {
    render(<TabHeader current="gas" unreadCount={3} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  test('no badge when unread count is zero', () => {
    render(<TabHeader current="gas" unreadCount={0} />);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  test('no Inbox badge when Inbox is not a neighbor of the current tab', () => {
    render(<TabHeader current="about" unreadCount={5} />);
    expect(screen.queryByText('5')).not.toBeInTheDocument();
  });
});
