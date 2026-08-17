import { useEffect, useState } from 'react';
import { useStartRound, type RoundChoice, type RoundPoll } from './useStartRound';
import { useVote } from './useVote';
import { useRerollQuestion } from './useRerollQuestion';
import { useCompleteRound } from './useCompleteRound';
import type { GqlFetch } from '../client';

/* 'failed' and 'empty' exist because startRound previously had an onSuccess and no onError: a
   failed round left mode at 'loading' forever, so both apps sat on a loading skeleton with no
   retry and no explanation. 'empty' is the other silent dead end — a round that comes back with
   no polls (a school with none enabled, or too few candidates to fill a grid) also left `poll`
   null against mode 'poll'. 10A names both states, so the hook now distinguishes them. */
/* 'out' is the rationing state: the daily allowance is spent, so there is nothing to play until
   nextRoundAt. Distinct from 'empty' (the school has no polls configured at all) because the two need
   opposite messages — one is "come back later", the other is "nothing exists yet". */
export type AuraMode = 'loading' | 'poll' | 'congrats' | 'playagain' | 'failed' | 'empty' | 'out';

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
  const rerollQuestion = useRerollQuestion({ gqlFetch, getToken });

  const [mode, setMode] = useState<AuraMode>('loading');
  const [polls, setPolls] = useState<RoundPoll[]>([]);
  const [roundId, setRoundId] = useState('');
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [shuffleUsed, setShuffleUsed] = useState(false);
  const [choices, setChoices] = useState<RoundChoice[]>([]);
  const [earned, setEarned] = useState(0);
  const [roundsLeft, setRoundsLeft] = useState(0);
  const [dailyLimit, setDailyLimit] = useState(0);
  const [nextRoundAt, setNextRoundAt] = useState<string | null>(null);
  // Priced by the server, never hardcoded here — see DESIGN-REQUESTS §7.2 on prices drifting.
  const [rerollCost, setRerollCost] = useState(0);
  const [roundPayout, setRoundPayout] = useState(0);
  const [votesToday, setVotesToday] = useState(0);
  const [followWeightFactor, setFollowWeightFactor] = useState(0);

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
        setRoundsLeft(round.roundsLeft);
        setDailyLimit(round.dailyLimit);
        setNextRoundAt(round.nextRoundAt);
        setRerollCost(round.rerollCost);
        setRoundPayout(round.roundPayout);
        setVotesToday(round.votesToday);
        setFollowWeightFactor(round.followWeightFactor);
        /* Three no-poll cases, and they are not the same thing: the allowance is spent ('out'), or the
           school has no polls at all ('empty'). Reading roundsLeft first keeps them apart. */
        if (round.polls.length > 0) setMode('poll');
        else if (round.roundsLeft <= 0) setMode('out');
        else setMode('empty');
      },
      onError: () => setMode('failed')
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

  /* The paid reroll, replacing what used to be a free client-side reshuffle of the same four people —
     a button labelled "new four" that never fetched anybody new. Still capped at one per question, so
     coins can't buy an unlimited hunt through the school for one prompt. */
  function reroll() {
    if (answered || shuffleUsed || !polls[index]) return;
    setShuffleUsed(true);
    rerollQuestion.mutate(
      { roundId, questionId: polls[index].questionId },
      {
        onSuccess: result => setChoices(result.choices),
        // Re-enable on failure (not enough coins, nobody new) so the attempt isn't silently spent.
        onError: () => setShuffleUsed(false)
      }
    );
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
    reroll,
    /** Alias kept so apps/web's existing Vote screen keeps compiling; same paid reroll underneath. */
    shuffle: reroll,
    rerollPending: rerollQuestion.isPending,
    rerollError: rerollQuestion.error instanceof Error ? rerollQuestion.error.message : null,
    roundsLeft,
    dailyLimit,
    rerollCost,
    roundPayout,
    votesToday,
    followWeightFactor,
    nextRoundAt,
    /** Which round of the daily allowance this is — the 1-of-3 the pips render. */
    roundNumber: Math.max(1, dailyLimit - roundsLeft),
    advance,
    cashOut: () => setMode('playagain'),
    playAgain: start,
    /** Retry after 'failed' (or 'empty' — polls may have been enabled since). */
    retry: start,
    error: startRound.error instanceof Error ? startRound.error.message : null
  };
}
