import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Inbox } from './_app.inbox';

const {
  useFlamesMock,
  markFlamesReadMock,
  useNotificationsMock,
  markNotificationsReadMock,
  revealFlameMock,
  revealFlameNameMock,
  activateGodModeMutateMock
} = vi.hoisted(() => ({
  useFlamesMock: vi.fn(),
  markFlamesReadMock: vi.fn(),
  useNotificationsMock: vi.fn(),
  markNotificationsReadMock: vi.fn(),
  revealFlameMock: vi.fn(),
  revealFlameNameMock: vi.fn(),
  activateGodModeMutateMock: vi.fn()
}));

vi.mock('@tanstack/react-router', () => ({ createFileRoute: () => (opts: unknown) => opts }));
vi.mock('../hooks/useFlames', () => ({ useFlames: useFlamesMock }));
vi.mock('../hooks/useMarkFlamesRead', () => ({ useMarkFlamesRead: () => ({ mutate: markFlamesReadMock }) }));
vi.mock('../hooks/useNotifications', () => ({ useNotifications: useNotificationsMock }));
vi.mock('../hooks/useMarkNotificationsRead', () => ({ useMarkNotificationsRead: () => ({ mutate: markNotificationsReadMock }) }));
vi.mock('../hooks/useRevealFlame', () => ({ useRevealFlame: () => ({ mutate: revealFlameMock, isError: false }) }));
vi.mock('../hooks/useRevealFlameName', () => ({ useRevealFlameName: () => ({ mutate: revealFlameNameMock, isError: false }) }));
vi.mock('../hooks/useActivateGodMode', () => ({ useActivateGodMode: () => ({ mutate: activateGodModeMutateMock, isError: false }) }));

const NAMED_FLAME = {
  id: 'vote_1', emoji: '🔥', q: 'Best smile', color: '#000', gender: 'girl', grade: '10th',
  revealed: true, godMode: false, unread: false, anonymous: false, initial: null, name: 'Sam Lee',
  repeatAdmirer: false, pickCount: 1, ts: '2026-01-01T00:00:00Z'
};
const HIDDEN_FLAME = { ...NAMED_FLAME, id: 'vote_2', revealed: false, name: null, q: 'Smartest' };
const ANON_FLAME = { ...NAMED_FLAME, id: 'vote_3', anonymous: true, godMode: true, name: null, q: 'Funniest' };

beforeEach(() => {
  useFlamesMock.mockReset();
  markFlamesReadMock.mockReset();
  useNotificationsMock.mockReset();
  markNotificationsReadMock.mockReset();
  revealFlameMock.mockReset();
  revealFlameNameMock.mockReset();
  activateGodModeMutateMock.mockReset();
  useNotificationsMock.mockReturnValue({ data: [] });
});

describe('Inbox', () => {
  test('marks flames read on mount', () => {
    useFlamesMock.mockReturnValue({ data: { flames: [], coins: 2, godMode: false, bonusRevealsLeft: 0 }, isLoading: false });
    render(<Inbox />);
    expect(markFlamesReadMock).toHaveBeenCalled();
  });

  test('renders the empty state when there are no flames', () => {
    useFlamesMock.mockReturnValue({ data: { flames: [], coins: 2, godMode: false, bonusRevealsLeft: 0 }, isLoading: false });
    render(<Inbox />);
    expect(screen.getByText(/No flames yet/)).toBeInTheDocument();
  });

  test('renders named, hinted, and anonymous flame states correctly', () => {
    useFlamesMock.mockReturnValue({
      data: { flames: [NAMED_FLAME, HIDDEN_FLAME, ANON_FLAME], coins: 2, godMode: false, bonusRevealsLeft: 0 },
      isLoading: false
    });
    render(<Inbox />);
    expect(screen.getByText(/From Sam Lee/)).toBeInTheDocument();
    expect(screen.getByText(/Someone in/)).toBeInTheDocument();
    expect(screen.getByText(/Anonymous/)).toBeInTheDocument();
  });

  test('tapping a hidden flame and revealing a hint calls revealFlame', () => {
    useFlamesMock.mockReturnValue({
      data: { flames: [HIDDEN_FLAME], coins: 2, godMode: false, bonusRevealsLeft: 0 },
      isLoading: false
    });
    render(<Inbox />);
    fireEvent.click(screen.getByText('Smartest'));
    fireEvent.click(screen.getByText('Reveal a hint · 🪙 1'));
    expect(revealFlameMock).toHaveBeenCalledWith('vote_2');
  });

  test('God Mode user with a repeat admirer and bonus reveals left can reveal the full name', () => {
    const repeatFlame = { ...HIDDEN_FLAME, revealed: true, godMode: true, repeatAdmirer: true, pickCount: 2 };
    useFlamesMock.mockReturnValue({
      data: { flames: [repeatFlame], coins: 2, godMode: true, bonusRevealsLeft: 1 },
      isLoading: false
    });
    render(<Inbox />);
    fireEvent.click(screen.getByText('Smartest'));
    fireEvent.click(screen.getByText(/Reveal their full name/));
    expect(revealFlameNameMock).toHaveBeenCalledWith('vote_2');
  });

  test('"See Who Likes You" opens the God Mode overlay', () => {
    useFlamesMock.mockReturnValue({ data: { flames: [], coins: 2, godMode: false, bonusRevealsLeft: 0 }, isLoading: false });
    render(<Inbox />);
    fireEvent.click(screen.getByText('👀 See Who Likes You'));
    expect(screen.getByText('GOD MODE')).toBeInTheDocument();
  });
});
