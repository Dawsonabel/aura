import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Gas } from './_app.gas';

const { startRoundMock, voteMock, completeRoundMock, useMeMock } = vi.hoisted(() => ({
  startRoundMock: vi.fn(),
  voteMock: vi.fn(),
  completeRoundMock: vi.fn(),
  useMeMock: vi.fn()
}));

vi.mock('@tanstack/react-router', () => ({ createFileRoute: () => (opts: unknown) => opts }));
vi.mock('../hooks/useStartRound', () => ({ useStartRound: () => ({ mutate: startRoundMock }) }));
vi.mock('../hooks/useVote', () => ({ useVote: () => ({ mutate: voteMock }) }));
vi.mock('../hooks/useCompleteRound', () => ({ useCompleteRound: () => ({ mutate: completeRoundMock }) }));
vi.mock('../hooks/useMe', () => ({ useMe: useMeMock }));

const ROUND = {
  roundId: 'rnd_1',
  canPlay: true,
  polls: [
    { questionId: 'pol_1', emoji: '🔥', text: 'Best smile', color: '#000', choices: [{ id: 'usr_a', name: 'Alex', boosted: null }, { id: 'usr_b', name: 'Bailey', boosted: null }] },
    { questionId: 'pol_2', emoji: '🧠', text: 'Smartest', color: '#000', choices: [{ id: 'usr_a', name: 'Alex', boosted: null }, { id: 'usr_b', name: 'Bailey', boosted: null }] }
  ]
};

beforeEach(() => {
  startRoundMock.mockReset();
  voteMock.mockReset();
  completeRoundMock.mockReset();
  useMeMock.mockReset();
  useMeMock.mockReturnValue({ data: { godMode: false } });
  startRoundMock.mockImplementation((_vars, { onSuccess }) => onSuccess(ROUND));
  completeRoundMock.mockImplementation((_roundId, { onSuccess }) => onSuccess({ coins: 6, earned: 2, already: false }));
});

describe('Gas screen', () => {
  test('starts a round on mount and renders the first poll', () => {
    render(<Gas />);
    expect(startRoundMock).toHaveBeenCalled();
    expect(screen.getByText('Best smile')).toBeInTheDocument();
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
  });

  test('picking a name locks the choices and fires the vote', () => {
    render(<Gas />);
    fireEvent.click(screen.getByText('Alex'));

    expect(voteMock).toHaveBeenCalledWith({ questionId: 'pol_1', targetId: 'usr_a', roundId: 'rnd_1' });
    expect(screen.getByText('Alex')).toBeDisabled();
    expect(screen.getByText('Tap to continue')).toBeInTheDocument();
  });

  test('finishing the last poll completes the round and shows congrats with the real earned amount', () => {
    render(<Gas />);
    fireEvent.click(screen.getByText('⏩ Skip')); // poll 1 -> poll 2, no vote fired
    fireEvent.click(screen.getByText('⏩ Skip')); // poll 2 -> round finished

    expect(completeRoundMock).toHaveBeenCalledWith('rnd_1', expect.any(Object));
    expect(screen.getByText('Congrats')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // earned, from the mocked completeRound result
  });

  test('Cash Out then Play Again Now restarts the loop', () => {
    render(<Gas />);
    // Skip through both polls to reach congrats
    fireEvent.click(screen.getByText('⏩ Skip'));
    fireEvent.click(screen.getByText('⏩ Skip'));

    expect(completeRoundMock).toHaveBeenCalledWith('rnd_1', expect.any(Object));
    expect(screen.getByText('Congrats')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // earned coins

    fireEvent.click(screen.getByText('🤑 Cash Out'));
    expect(screen.getByText('Play Again')).toBeInTheDocument();

    startRoundMock.mockClear();
    fireEvent.click(screen.getByText('Play Again Now'));
    expect(startRoundMock).toHaveBeenCalled();
  });
});
