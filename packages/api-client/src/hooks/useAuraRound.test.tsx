import { describe, test, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useAuraRound } from './useAuraRound';
import type { PollRound } from './useStartRound';
import type { GqlFetch } from '../client';

/* The voting loop's state machine, shared verbatim by apps/mobile (live) and apps/web. Tested at
   the hook boundary with an injected gqlFetch — no module mocks — because the params are already
   the seam: each app passes its own fetch and token getter.

   This file replaced apps/web's _app.aura.test.tsx, which exercised the same machine through the
   (dead, admin-app) consumer Vote screen. The machine is what mobile actually ships; the web
   screen was just the harness it happened to be tested in. */

function makeRound(over: Partial<PollRound> = {}): PollRound {
  return {
    roundId: 'rnd_1',
    canPlay: true,
    roundsLeft: 1,
    roundsPerHour: 1,
    nextRoundAt: '2026-08-20T16:00:00.000Z',
    rerollCost: 5,
    votePayout: 1,
    roundPayout: 12,
    votesToday: 0,
    followWeightFactor: 3,
    answeredQuestionIds: [],
    polls: [
      {
        questionId: 'q1',
        emoji: '🔥',
        text: 'Best smile',
        color: '#111',
        choices: [
          { id: 'usr_a', name: 'Alex', grade: '10', boosted: null },
          { id: 'usr_b', name: 'Bailey', grade: '11', boosted: null }
        ]
      },
      {
        questionId: 'q2',
        emoji: '🧠',
        text: 'Smartest',
        color: '#222',
        choices: [
          { id: 'usr_c', name: 'Casey', grade: '9', boosted: null },
          { id: 'usr_d', name: 'Drew', grade: '12', boosted: null }
        ]
      }
    ],
    ...over
  };
}

/* One fake server for the whole file: dispatches on the operation in the document, so a test reads
   as "given this round, the hook does X" instead of a queue of mockResolvedValueOnce in call order. */
function fakeServer(round: PollRound) {
  const calls: string[] = [];
  const gqlFetch = vi.fn(async (query: string) => {
    if (query.includes('query PollRound')) {
      calls.push('start');
      return { pollRound: round };
    }
    if (query.includes('mutation Vote')) {
      calls.push('vote');
      return { vote: { ok: true, dup: null } };
    }
    if (query.includes('mutation CompleteRound')) {
      calls.push('complete');
      return { completeRound: { coins: 20, earned: 12, already: null } };
    }
    if (query.includes('mutation RerollQuestion')) {
      calls.push('reroll');
      return {
        rerollQuestion: {
          coins: 15,
          choices: [
            { id: 'usr_x', name: 'Xander', grade: '10', boosted: null },
            { id: 'usr_y', name: 'Yara', grade: '10', boosted: null }
          ]
        }
      };
    }
    throw new Error('unexpected operation: ' + query.slice(0, 60));
  }) as unknown as GqlFetch & { mock: { calls: unknown[][] } };
  return { gqlFetch, calls };
}

function renderRound(gqlFetch: GqlFetch, enabled = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(
    ({ on }: { on: boolean }) =>
      useAuraRound({ gqlFetch, getToken: async () => 'tok', enabled: on }),
    { wrapper, initialProps: { on: enabled } }
  );
}

describe('useAuraRound', () => {
  test('a fresh round opens on its first question in poll mode', async () => {
    const { gqlFetch } = fakeServer(makeRound());
    const { result } = renderRound(gqlFetch);

    await waitFor(() => expect(result.current.mode).toBe('poll'));
    expect(result.current.poll?.questionId).toBe('q1');
    expect(result.current.count).toBe(1);
    expect(result.current.total).toBe(2);
    // Prices arrive from the server, never hardcoded client-side.
    expect(result.current.rerollCost).toBe(5);
  });

  test('a resumed round opens at the first unanswered question, not at index 0', async () => {
    const { gqlFetch } = fakeServer(makeRound({ answeredQuestionIds: ['q1'] }));
    const { result } = renderRound(gqlFetch);

    await waitFor(() => expect(result.current.mode).toBe('poll'));
    // Opening on q1 replays an answered question: voting there is a silent dup and reroll errors.
    expect(result.current.poll?.questionId).toBe('q2');
  });

  test('does not start until enabled — the cold-start deep-link auth gate', async () => {
    const { gqlFetch, calls } = fakeServer(makeRound());
    const { result, rerender } = renderRound(gqlFetch, false);

    expect(result.current.mode).toBe('loading');
    expect(calls).toEqual([]);

    rerender({ on: true });
    await waitFor(() => expect(result.current.mode).toBe('poll'));
    expect(calls).toEqual(['start']);
  });

  test('no polls means "out" when the allowance is spent, "empty" when the school has none', async () => {
    const out = fakeServer(makeRound({ polls: [], roundsLeft: 0 }));
    const { result: outResult } = renderRound(out.gqlFetch);
    await waitFor(() => expect(outResult.current.mode).toBe('out'));

    const empty = fakeServer(makeRound({ polls: [], roundsLeft: 1 }));
    const { result: emptyResult } = renderRound(empty.gqlFetch);
    await waitFor(() => expect(emptyResult.current.mode).toBe('empty'));
  });

  test('a failed start lands on "failed" with the server message, and retry() recovers', async () => {
    let healthy = false;
    const { gqlFetch } = fakeServer(makeRound());
    const flaky = (async (query: string, vars?: Record<string, unknown>, token?: string | null) => {
      if (!healthy) throw new Error('Not logged in');
      return gqlFetch(query, vars, token);
    }) as GqlFetch;

    const { result } = renderRound(flaky);
    await waitFor(() => expect(result.current.mode).toBe('failed'));
    expect(result.current.error).toBe('Not logged in');

    healthy = true;
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.mode).toBe('poll'));
  });

  test('pick votes once and locks the grid — a second tap sends nothing', async () => {
    const { gqlFetch, calls } = fakeServer(makeRound());
    const { result } = renderRound(gqlFetch);
    await waitFor(() => expect(result.current.mode).toBe('poll'));

    act(() => result.current.pick('usr_a'));
    expect(result.current.answered).toBe(true);
    act(() => result.current.pick('usr_b'));

    await waitFor(() => expect(calls.filter(c => c === 'vote')).toHaveLength(1));
  });

  test('advance walks the round and the last advance completes it with the earned total', async () => {
    const { gqlFetch, calls } = fakeServer(makeRound());
    const { result } = renderRound(gqlFetch);
    await waitFor(() => expect(result.current.mode).toBe('poll'));

    act(() => result.current.pick('usr_a'));
    act(() => result.current.advance());
    expect(result.current.poll?.questionId).toBe('q2');
    expect(result.current.answered).toBe(false);

    act(() => result.current.pick('usr_c'));
    act(() => result.current.advance());
    await waitFor(() => expect(result.current.mode).toBe('congrats'));
    expect(result.current.earned).toBe(12);
    expect(calls).toEqual(['start', 'vote', 'vote', 'complete']);
  });

  test('reroll swaps in the new candidates', async () => {
    const { gqlFetch } = fakeServer(makeRound());
    const { result } = renderRound(gqlFetch);
    await waitFor(() => expect(result.current.mode).toBe('poll'));

    act(() => result.current.reroll());
    await waitFor(() => expect(result.current.choices.map(c => c.name)).toEqual(['Xander', 'Yara']));
    // The question itself stays; only its four faces changed.
    expect(result.current.poll?.questionId).toBe('q1');
  });

  test('reroll is refused once the question is answered — it would buy a second vote', async () => {
    const { gqlFetch, calls } = fakeServer(makeRound());
    const { result } = renderRound(gqlFetch);
    await waitFor(() => expect(result.current.mode).toBe('poll'));

    act(() => result.current.pick('usr_a'));
    act(() => result.current.reroll());

    await waitFor(() => expect(calls.filter(c => c === 'vote')).toHaveLength(1));
    expect(calls.filter(c => c === 'reroll')).toHaveLength(0);
  });
});
