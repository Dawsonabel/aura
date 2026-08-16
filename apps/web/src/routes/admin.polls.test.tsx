import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Polls } from './admin.polls';

const { useAdminPollsMock, createPollMutateMock, updatePollMutateMock, deletePollMutateMock } = vi.hoisted(() => ({
  useAdminPollsMock: vi.fn(),
  createPollMutateMock: vi.fn(),
  updatePollMutateMock: vi.fn(),
  deletePollMutateMock: vi.fn()
}));

vi.mock('@tanstack/react-router', () => ({ createFileRoute: () => (opts: unknown) => opts }));
vi.mock('../hooks/useAdminPolls', () => ({ useAdminPolls: useAdminPollsMock }));
vi.mock('../hooks/useCreatePoll', () => ({ useCreatePoll: () => ({ mutate: createPollMutateMock }) }));
vi.mock('../hooks/useUpdatePoll', () => ({ useUpdatePoll: () => ({ mutate: updatePollMutateMock }) }));
vi.mock('../hooks/useDeletePoll', () => ({ useDeletePoll: () => ({ mutate: deletePollMutateMock }) }));

const POLL = { id: 'pol_1', emoji: '🎯', text: 'Test poll', color: '#123456', enabled: true, schoolId: null };

beforeEach(() => {
  useAdminPollsMock.mockReset();
  createPollMutateMock.mockReset();
  updatePollMutateMock.mockReset();
  deletePollMutateMock.mockReset();
  useAdminPollsMock.mockReturnValue({ data: [POLL] });
});

describe('Polls (admin)', () => {
  test('renders the polls table', () => {
    render(<Polls />);
    expect(screen.getByText('Test poll')).toBeInTheDocument();
    expect(screen.getByText('All schools')).toBeInTheDocument();
  });

  test('toggling enabled calls updatePoll', () => {
    render(<Polls />);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(updatePollMutateMock).toHaveBeenCalledWith({ id: 'pol_1', enabled: false });
  });

  describe('with window.prompt/confirm stubbed', () => {
    const originalPrompt = window.prompt;
    const originalConfirm = window.confirm;
    afterEach(() => {
      window.prompt = originalPrompt;
      window.confirm = originalConfirm;
    });

    test('Add prompt creates a poll', () => {
      window.prompt = vi.fn().mockReturnValueOnce('🔥').mockReturnValueOnce('New prompt').mockReturnValueOnce('#000000');
      render(<Polls />);
      fireEvent.click(screen.getByText('+ Add prompt'));
      expect(createPollMutateMock).toHaveBeenCalledWith({ emoji: '🔥', text: 'New prompt', color: '#000000' });
    });

    test('Delete confirms then calls deletePoll', () => {
      window.confirm = vi.fn().mockReturnValue(true);
      render(<Polls />);
      fireEvent.click(screen.getByText('Delete'));
      expect(deletePollMutateMock).toHaveBeenCalledWith('pol_1');
    });
  });
});
