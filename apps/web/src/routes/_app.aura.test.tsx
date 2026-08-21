import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Aura } from './_app.aura';

function renderAura() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Aura />
    </QueryClientProvider>
  );
}

// useAuraRound now lives in packages/api-client (shared with apps/mobile) and is exercised
// end-to-end here through a mocked gqlFetch — same strategy as useUpdateMe.test.tsx — rather
// than mocking the individual useStartRound/useVote/useCompleteRound hooks, so this test still
// covers the real state-machine behavior, not just presentation.
const { gqlFetchMock, useMeMock } = vi.hoisted(() => ({
  gqlFetchMock: vi.fn(),
  useMeMock: vi.fn()
}));

vi.mock('@tanstack/react-router', () => ({ createFileRoute: () => (opts: unknown) => opts }));
vi.mock('@clerk/tanstack-react-start', () => ({ useAuth: () => ({ getToken: vi.fn().mockResolvedValue('a-real-token'), isSignedIn: true }) }));
vi.mock('../lib/graphql', () => ({ gqlFetch: gqlFetchMock }));
vi.mock('../hooks/useMe', () => ({ useMe: useMeMock }));

/* `answeredQuestionIds` is non-nullable in the schema, so a real server always sends it — the hook
   reads it to open a resumed round on the first question actually left to play. Empty here: this mock
   is a fresh round, and every test below starts from its first poll. */
const ROUND = {
  roundId: 'rnd_1',
  canPlay: true,
  answeredQuestionIds: [],
  polls: [
    { questionId: 'pol_1', emoji: '🔥', text: 'Best smile', color: '#000', choices: [{ id: 'usr_a', name: 'Alex', boosted: null }, { id: 'usr_b', name: 'Bailey', boosted: null }] },
    { questionId: 'pol_2', emoji: '🧠', text: 'Smartest', color: '#000', choices: [{ id: 'usr_a', name: 'Alex', boosted: null }, { id: 'usr_b', name: 'Bailey', boosted: null }] }
  ]
};

beforeEach(() => {
  gqlFetchMock.mockReset();
  useMeMock.mockReset();
  useMeMock.mockReturnValue({ data: { infiniteAura: false } });
  gqlFetchMock.mockImplementation((query: string) => {
    if (query.includes('query PollRound')) return Promise.resolve({ pollRound: ROUND });
    if (query.includes('mutation Vote')) return Promise.resolve({ vote: { ok: true, dup: false } });
    if (query.includes('mutation CompleteRound')) return Promise.resolve({ completeRound: { coins: 6, earned: 2, already: false } });
    throw new Error(`unexpected query in test: ${query}`);
  });
});

describe('Aura screen', () => {
  test('starts a round on mount and renders the first poll', async () => {
    renderAura();
    expect(await screen.findByText('Best smile')).toBeInTheDocument();
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
  });

  test('picking a name locks the choices and fires the vote', async () => {
    renderAura();
    fireEvent.click(await screen.findByText('Alex'));

    expect(screen.getByText('Alex')).toBeDisabled();
    expect(screen.getByText('Tap to continue')).toBeInTheDocument();
    await waitFor(() =>
      expect(gqlFetchMock).toHaveBeenCalledWith(
        expect.stringContaining('mutation Vote'),
        { questionId: 'pol_1', targetId: 'usr_a', roundId: 'rnd_1' },
        'a-real-token'
      )
    );
  });

  test('finishing the last poll completes the round and shows congrats with the real earned amount', async () => {
    renderAura();
    fireEvent.click(await screen.findByText('⏩ Skip')); // poll 1 -> poll 2, no vote fired
    fireEvent.click(screen.getByText('⏩ Skip')); // poll 2 -> round finished

    expect(await screen.findByText('Congrats')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // earned, from the mocked completeRound result
  });

  test('Cash Out then Play Again Now restarts the loop', async () => {
    renderAura();
    // Skip through both polls to reach congrats
    fireEvent.click(await screen.findByText('⏩ Skip'));
    fireEvent.click(screen.getByText('⏩ Skip'));

    expect(await screen.findByText('Congrats')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // earned coins

    fireEvent.click(screen.getByText('🤑 Cash Out'));
    expect(screen.getByText('Play Again')).toBeInTheDocument();

    gqlFetchMock.mockClear();
    fireEvent.click(screen.getByText('Play Again Now'));
    expect(await screen.findByText('Best smile')).toBeInTheDocument();
  });
});
