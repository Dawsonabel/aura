import { useEffect, useState } from 'react';
import { useStartRound, type RoundChoice, type RoundPoll } from './useStartRound';
import { useVote } from './useVote';
import { useCompleteRound } from './useCompleteRound';
import type { GqlFetch } from '../client';

export type AuraMode = 'loading' | 'poll' | 'congrats' | 'playagain';

function shuffled<T>(items: T[]): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export type UseAuraRoundParams = {
  gqlFetch: GqlFetch;
  getToken: () => Promise<string | null | undefined>;
  enabled: boolean;
};

/* Owns the whole voting-loop state machine (mode/polls/roundId/index/answered/shuffleUsed/
   choices/earned + start/pick/shuffle/advance) so apps/web and apps/mobile don't hand-duplicate
   it — they were, verbatim, before this was extracted; the Gas->Aura rename had to be applied
   identically in both files, which is exactly the drift risk shared hooks avoid elsewhere in
   this package. Each app's screen is left with nothing but presentational components. */
export function useAuraRound({ gqlFetch, getToken, enabled }: UseAuraRoundParams) {
  const startRound = useStartRound({ gqlFetch, getToken });
  const vote = useVote({ gqlFetch, getToken });
  const completeRound = useCompleteRound({ gqlFetch, getToken });

  const [mode, setMode] = useState<AuraMode>('loading');
  const [polls, setPolls] = useState<RoundPoll[]>([]);
  const [roundId, setRoundId] = useState('');
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [shuffleUsed, setShuffleUsed] = useState(false);
  const [choices, setChoices] = useState<RoundChoice[]>([]);
  const [earned, setEarned] = useState(0);

  function start() {
    setMode('loading');
    startRound.mutate(undefined, {
      onSuccess: round => {
        setRoundId(round.roundId);
        setPolls(round.polls);
        setIndex(0);
        setAnswered(false);
        setShuffleUsed(false);
        setChoices(round.polls[0]?.choices ?? []);
        setMode('poll');
      }
    });
  }

  // Runs once auth is actually ready (not on raw mount) — a cold-start deep link straight into
  // the Aura screen can render before the client's async token cache resolves, and startRound
  // needs a real token. `start` itself is stable enough for this screen's purposes; re-running on
  // every render identity change would restart the round unexpectedly.
  useEffect(() => {
    if (enabled) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  function pick(targetId: string) {
    if (answered) return;
    setAnswered(true);
    const q = polls[index];
    // Fire-and-forget, matching the app's optimistic UI — the grid locks immediately rather than
    // waiting on the round trip.
    vote.mutate({ questionId: q.questionId, targetId, roundId });
  }

  function shuffle() {
    if (answered || shuffleUsed) return;
    setShuffleUsed(true);
    setChoices(shuffled(choices));
  }

  function advance() {
    const nextIndex = index + 1;
    if (nextIndex >= polls.length) {
      completeRound.mutate(roundId, {
        onSuccess: result => {
          setEarned(result.earned);
          setMode('congrats');
        }
      });
      return;
    }
    setIndex(nextIndex);
    setAnswered(false);
    setShuffleUsed(false);
    setChoices(polls[nextIndex].choices);
  }

  return {
    mode,
    poll: polls[index] ?? null,
    choices,
    count: index + 1,
    total: polls.length,
    answered,
    shuffleUsed,
    earned,
    pick,
    shuffle,
    advance,
    cashOut: () => setMode('playagain'),
    playAgain: start
  };
}
