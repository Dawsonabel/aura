import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Profile } from './_app.profile';

const {
  useMeMock,
  updateMeMutateMock,
  useFriendsMock,
  useBlockedMock,
  useAurasMock,
  removeFriendMutateMock,
  blockUserMutateMock,
  unblockUserMutateMock,
  reportUserMutateMock,
  deleteMeMutateMock,
  signOutMock,
  navigateMock,
  useSuggestionsMock,
  boostRandomMutateMock,
  boostCrushMutateMock,
  activateInfiniteAuraMutateMock
} = vi.hoisted(() => ({
  useMeMock: vi.fn(),
  updateMeMutateMock: vi.fn(),
  useFriendsMock: vi.fn(),
  useBlockedMock: vi.fn(),
  useAurasMock: vi.fn(),
  removeFriendMutateMock: vi.fn(),
  blockUserMutateMock: vi.fn(),
  unblockUserMutateMock: vi.fn(),
  reportUserMutateMock: vi.fn(),
  deleteMeMutateMock: vi.fn(),
  signOutMock: vi.fn(),
  navigateMock: vi.fn(),
  useSuggestionsMock: vi.fn(),
  boostRandomMutateMock: vi.fn(),
  boostCrushMutateMock: vi.fn(),
  activateInfiniteAuraMutateMock: vi.fn()
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (opts: unknown) => opts,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
  useNavigate: () => navigateMock
}));
vi.mock('@clerk/tanstack-react-start', () => ({ useClerk: () => ({ signOut: signOutMock }) }));
vi.mock('../hooks/useMe', () => ({ useMe: useMeMock }));
vi.mock('../hooks/useUpdateMe', () => ({ useUpdateMe: () => ({ mutate: updateMeMutateMock }) }));
vi.mock('../hooks/useFriends', () => ({ useFriends: useFriendsMock }));
vi.mock('../hooks/useBlocked', () => ({ useBlocked: useBlockedMock }));
vi.mock('../hooks/useAuras', () => ({ useAuras: useAurasMock }));
vi.mock('../hooks/useRemoveFriend', () => ({ useRemoveFriend: () => ({ mutate: removeFriendMutateMock }) }));
vi.mock('../hooks/useBlockUser', () => ({ useBlockUser: () => ({ mutate: blockUserMutateMock }) }));
vi.mock('../hooks/useUnblockUser', () => ({ useUnblockUser: () => ({ mutate: unblockUserMutateMock }) }));
vi.mock('../hooks/useReportUser', () => ({ useReportUser: () => ({ mutate: reportUserMutateMock }) }));
vi.mock('../hooks/useDeleteMe', () => ({ useDeleteMe: () => ({ mutate: deleteMeMutateMock }) }));
vi.mock('../hooks/useSuggestions', () => ({ useSuggestions: useSuggestionsMock }));
vi.mock('../hooks/useBoostRandom', () => ({ useBoostRandom: () => ({ mutate: boostRandomMutateMock, isError: false }) }));
vi.mock('../hooks/useBoostCrush', () => ({ useBoostCrush: () => ({ mutate: boostCrushMutateMock, isError: false }) }));
vi.mock('../hooks/useActivateInfiniteAura', () => ({ useActivateInfiniteAura: () => ({ mutate: activateInfiniteAuraMutateMock, isError: false }) }));

const ME = { id: 'usr_1', firstName: 'Alex', lastName: 'Kim', username: 'alexk', gender: 'girl', coins: 5, infiniteAura: false, hideTopAuras: false };
const FRIEND = { id: 'usr_2', firstName: 'Bailey', lastName: 'Ray' };

beforeEach(() => {
  useMeMock.mockReset();
  updateMeMutateMock.mockReset();
  useFriendsMock.mockReset();
  useBlockedMock.mockReset();
  useAurasMock.mockReset();
  removeFriendMutateMock.mockReset();
  blockUserMutateMock.mockReset();
  unblockUserMutateMock.mockReset();
  reportUserMutateMock.mockReset();
  deleteMeMutateMock.mockReset();
  signOutMock.mockReset();
  navigateMock.mockReset();
  useSuggestionsMock.mockReset();
  boostRandomMutateMock.mockReset();
  boostCrushMutateMock.mockReset();
  activateInfiniteAuraMutateMock.mockReset();

  useMeMock.mockReturnValue({ data: ME });
  useFriendsMock.mockReturnValue({ data: [FRIEND] });
  useBlockedMock.mockReturnValue({ data: [], isLoading: false });
  useAurasMock.mockReturnValue({
    data: { auras: [{ q: 'Best smile', emoji: '😁' }, { q: 'Best smile', emoji: '😁' }, { q: 'Funniest', emoji: '😂' }], coins: 5, infiniteAura: false }
  });
  useSuggestionsMock.mockReturnValue({ data: { contacts: [], fof: [] } });
});

describe('Profile', () => {
  test('renders name, username, and friend row', () => {
    render(<Profile />);
    expect(screen.getByText('Alex Kim')).toBeInTheDocument();
    expect(screen.getByText('@alexk')).toBeInTheDocument();
    expect(screen.getByText('Bailey Ray')).toBeInTheDocument();
  });

  test('Top Auras groups by question, sorted by count', () => {
    render(<Profile />);
    const bestSmile = screen.getByText('Best smile').closest('div.rounded.border') as HTMLElement;
    expect(bestSmile).toHaveTextContent('🔥 2');
  });

  test('Top Auras is hidden when hideTopAuras is set', () => {
    useMeMock.mockReturnValue({ data: { ...ME, hideTopAuras: true } });
    render(<Profile />);
    expect(screen.queryByText('Top Auras 🔥')).not.toBeInTheDocument();
  });

  test('editing a field in Edit Profile auto-saves via updateMe', () => {
    render(<Profile />);
    fireEvent.click(screen.getByText('EDIT PROFILE'));
    fireEvent.change(screen.getByPlaceholderText('First name'), { target: { value: 'Alexa' } });
    expect(updateMeMutateMock).toHaveBeenCalledWith({ firstName: 'Alexa' });
  });

  test('tapping a friend then Remove Friend calls removeFriend', () => {
    render(<Profile />);
    fireEvent.click(screen.getByText('Bailey Ray'));
    fireEvent.click(screen.getByText('Remove Friend'));
    expect(removeFriendMutateMock).toHaveBeenCalledWith('usr_2');
  });

  describe('with window.confirm/prompt stubbed', () => {
    const originalConfirm = window.confirm;
    const originalPrompt = window.prompt;
    afterEach(() => {
      window.confirm = originalConfirm;
      window.prompt = originalPrompt;
    });

    test('Block User confirms then calls blockUser', () => {
      window.confirm = vi.fn().mockReturnValue(true);
      render(<Profile />);
      fireEvent.click(screen.getByText('Bailey Ray'));
      fireEvent.click(screen.getByText('Block User'));
      expect(blockUserMutateMock).toHaveBeenCalledWith('usr_2');
    });

    test('Block User does nothing if the confirm is declined', () => {
      window.confirm = vi.fn().mockReturnValue(false);
      render(<Profile />);
      fireEvent.click(screen.getByText('Bailey Ray'));
      fireEvent.click(screen.getByText('Block User'));
      expect(blockUserMutateMock).not.toHaveBeenCalled();
    });

    test('Report User prompts for a reason then calls reportUser', () => {
      window.prompt = vi.fn().mockReturnValue('being weird');
      render(<Profile />);
      fireEvent.click(screen.getByText('Bailey Ray'));
      fireEvent.click(screen.getByText('Report User'));
      expect(reportUserMutateMock).toHaveBeenCalledWith({ userId: 'usr_2', reason: 'being weird' });
    });

    test('Delete Account confirms then calls deleteMe', () => {
      window.confirm = vi.fn().mockReturnValue(true);
      render(<Profile />);
      fireEvent.click(screen.getByText('EDIT PROFILE'));
      fireEvent.click(screen.getByText('Manage Account'));
      fireEvent.click(screen.getByText('Delete Account'));
      expect(deleteMeMutateMock).toHaveBeenCalled();
    });
  });

  test('Logout calls Clerk signOut and navigates home', async () => {
    render(<Profile />);
    fireEvent.click(screen.getByText('EDIT PROFILE'));
    fireEvent.click(screen.getByText('Logout'));
    expect(signOutMock).toHaveBeenCalled();
  });

  test('tapping the coins box opens the Shop overlay', () => {
    render(<Profile />);
    fireEvent.click(screen.getByText('🪙 5 coins'));
    expect(screen.getByText('Shop')).toBeInTheDocument();
  });

  test('tapping "Unlock Infinite Aura" opens the Infinite Aura overlay', () => {
    render(<Profile />);
    fireEvent.click(screen.getByText('👑 Unlock Infinite Aura'));
    expect(screen.getByText('INFINITE AURA')).toBeInTheDocument();
  });

  test('Infinite Aura active badge is shown instead of the unlock banner when already active', () => {
    useMeMock.mockReturnValue({ data: { ...ME, infiniteAura: true } });
    render(<Profile />);
    expect(screen.getByText('👑 Infinite Aura active')).toBeInTheDocument();
    expect(screen.queryByText('👑 Unlock Infinite Aura')).not.toBeInTheDocument();
  });
});
