import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Inbox } from './_app.inbox';

const {
  useAurasMock,
  markAurasReadMock,
  useNotificationsMock,
  markNotificationsReadMock,
  activateInfiniteAuraMutateMock
} = vi.hoisted(() => ({
  useAurasMock: vi.fn(),
  markAurasReadMock: vi.fn(),
  useNotificationsMock: vi.fn(),
  markNotificationsReadMock: vi.fn(),
  activateInfiniteAuraMutateMock: vi.fn()
}));

vi.mock('@tanstack/react-router', () => ({ createFileRoute: () => (opts: unknown) => opts }));
vi.mock('../hooks/useAuras', () => ({ useAuras: useAurasMock }));
vi.mock('../hooks/useMarkAurasRead', () => ({ useMarkAurasRead: () => ({ mutate: markAurasReadMock }) }));
vi.mock('../hooks/useNotifications', () => ({ useNotifications: useNotificationsMock }));
vi.mock('../hooks/useMarkNotificationsRead', () => ({ useMarkNotificationsRead: () => ({ mutate: markNotificationsReadMock }) }));
vi.mock('../hooks/useActivateInfiniteAura', () => ({ useActivateInfiniteAura: () => ({ mutate: activateInfiniteAuraMutateMock, isError: false }) }));

/* Two states, matching the payload: a flipped card carries the name and grade, a face-down one carries
   neither. The old fixtures also set `revealed`/`initial` for the clue ladder's middle rungs; there are
   no middle rungs now. */
const NAMED_AURA = {
  id: 'vote_1', emoji: '🔥', q: 'Best smile', color: '#000', gender: 'girl', grade: '10th',
  infiniteAura: false, unread: false, anonymous: false, name: 'Sam Lee',
  repeatAdmirer: false, pickCount: 1, ts: '2026-01-01T00:00:00Z', detailHidden: false
};
const HIDDEN_AURA = { ...NAMED_AURA, id: 'vote_2', name: null, grade: '', q: 'Smartest' };
const ANON_AURA = { ...NAMED_AURA, id: 'vote_3', anonymous: true, infiniteAura: true, name: null, grade: '', q: 'Funniest' };

beforeEach(() => {
  useAurasMock.mockReset();
  markAurasReadMock.mockReset();
  useNotificationsMock.mockReset();
  markNotificationsReadMock.mockReset();
  activateInfiniteAuraMutateMock.mockReset();
  useNotificationsMock.mockReturnValue({ data: [] });
});

describe('Inbox', () => {
  test('marks auras read on mount', () => {
    useAurasMock.mockReturnValue({ data: { auras: [], coins: 2, infiniteAura: false }, isLoading: false });
    render(<Inbox />);
    expect(markAurasReadMock).toHaveBeenCalled();
  });

  test('renders the empty state when there are no auras', () => {
    useAurasMock.mockReturnValue({ data: { auras: [], coins: 2, infiniteAura: false }, isLoading: false });
    render(<Inbox />);
    expect(screen.getByText(/No auras yet/)).toBeInTheDocument();
  });

  test('renders flipped, face-down and anonymous cards correctly', () => {
    useAurasMock.mockReturnValue({
      data: { auras: [NAMED_AURA, HIDDEN_AURA, ANON_AURA], coins: 2, infiniteAura: false },
      isLoading: false
    });
    render(<Inbox />);
    expect(screen.getByText(/From Sam Lee/)).toBeInTheDocument();
    expect(screen.getByText(/Girl picked you/)).toBeInTheDocument();
    expect(screen.getByText(/Anonymous/)).toBeInTheDocument();
  });

  /* This screen is read-only now. Opening a card is a flip — a mobile flow with a daily allowance and a
     paywall behind it — and apps/web is the admin dashboard, so it shows state and offers no way to
     spend anything. The two tests that used to click "Reveal a hint" and "Reveal their full name" went
     with the buttons; this one pins that no such affordance came back. */
  test('a face-down card offers no way to open it', () => {
    useAurasMock.mockReturnValue({
      data: { auras: [HIDDEN_AURA], coins: 2, infiniteAura: false },
      isLoading: false
    });
    render(<Inbox />);
    fireEvent.click(screen.getByText('Smartest'));
    expect(screen.getByText(/Face down/)).toBeInTheDocument();
    expect(screen.queryByText(/Reveal/)).not.toBeInTheDocument();
    expect(screen.queryByText(/🪙/)).not.toBeInTheDocument();
  });

  test('"See Who Likes You" opens the Infinite Aura overlay', () => {
    useAurasMock.mockReturnValue({ data: { auras: [], coins: 2, infiniteAura: false }, isLoading: false });
    render(<Inbox />);
    fireEvent.click(screen.getByText('👀 See Who Likes You'));
    expect(screen.getByText('INFINITE AURA')).toBeInTheDocument();
  });
});
