import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Votes } from './admin.votes';

const { useAdminVotesMock, deleteVoteMutateMock } = vi.hoisted(() => ({ useAdminVotesMock: vi.fn(), deleteVoteMutateMock: vi.fn() }));

vi.mock('@tanstack/react-router', () => ({ createFileRoute: () => (opts: unknown) => opts }));
vi.mock('../hooks/useAdminVotes', () => ({ useAdminVotes: useAdminVotesMock }));
vi.mock('../hooks/useDeleteVote', () => ({ useDeleteVote: () => ({ mutate: deleteVoteMutateMock }) }));

const VOTE = { id: 'vote_1', voterName: 'Alex Kim', targetName: 'Sam Lee', text: 'Best smile', ts: '2026-01-01T00:00:00.000Z' };

beforeEach(() => {
  useAdminVotesMock.mockReset();
  deleteVoteMutateMock.mockReset();
  useAdminVotesMock.mockReturnValue({ data: [VOTE] });
});

describe('Votes (admin)', () => {
  test('renders the activity feed', () => {
    render(<Votes />);
    expect(screen.getByText('Alex Kim')).toBeInTheDocument();
    expect(screen.getByText('Sam Lee')).toBeInTheDocument();
  });

  test('Delete confirms then calls deleteVote', () => {
    const originalConfirm = window.confirm;
    window.confirm = vi.fn().mockReturnValue(true);
    render(<Votes />);
    fireEvent.click(screen.getByText('Delete'));
    expect(deleteVoteMutateMock).toHaveBeenCalledWith('vote_1');
    window.confirm = originalConfirm;
  });
});
