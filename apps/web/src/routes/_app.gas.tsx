import { useEffect, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useStartRound, type RoundChoice, type RoundPoll } from '../hooks/useStartRound';
import { useVote } from '../hooks/useVote';
import { useCompleteRound } from '../hooks/useCompleteRound';
import { useMe } from '../hooks/useMe';

export const Route = createFileRoute('/_app/gas')({
  component: Gas
});

type Mode = 'loading' | 'poll' | 'congrats' | 'playagain';

function shuffled<T>(items: T[]): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function Gas() {
  const startRound = useStartRound();
  const vote = useVote();
  const completeRound = useCompleteRound();
  const { data: me } = useMe();

  const [mode, setMode] = useState<Mode>('loading');
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

  // Runs once on mount only — start() itself is stable enough for this screen's purposes, and
  // re-running it on every render identity change would restart the round unexpectedly.
  useEffect(() => {
    start();
  }, []);

  function pickName(targetId: string) {
    if (answered) return;
    setAnswered(true);
    const q = polls[index];
    // Fire-and-forget, matching the old app's optimistic UI — the grid locks immediately rather
    // than waiting on the round trip.
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

  if (mode === 'loading') return <LoadingView />;
  if (mode === 'congrats') return <CongratsView earned={earned} godMode={!!me?.godMode} onCashOut={() => setMode('playagain')} />;
  if (mode === 'playagain') return <PlayAgainView onPlayAgain={start} />;

  const q = polls[index];
  if (!q) return <LoadingView />;

  return (
    <PollView
      poll={q}
      choices={choices}
      count={index + 1}
      total={polls.length}
      answered={answered}
      shuffleUsed={shuffleUsed}
      onPick={pickName}
      onShuffle={shuffle}
      onAdvance={advance}
    />
  );
}

function LoadingView() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2">
      <div className="text-2xl font-bold">GAS</div>
      <p className="text-gray-500">Loading Polls</p>
    </div>
  );
}

function PollView({
  poll,
  choices,
  count,
  total,
  answered,
  shuffleUsed,
  onPick,
  onShuffle,
  onAdvance
}: {
  poll: RoundPoll;
  choices: RoundChoice[];
  count: number;
  total: number;
  answered: boolean;
  shuffleUsed: boolean;
  onPick: (targetId: string) => void;
  onShuffle: () => void;
  onAdvance: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-gray-500">
        {count} of {total}
      </p>
      <div className="text-4xl">{poll.emoji}</div>
      <h1 className="text-xl font-semibold">{poll.text}</h1>
      <div className="grid grid-cols-2 gap-2">
        {choices.map(c => (
          <button
            key={c.id}
            type="button"
            disabled={answered}
            onClick={() => onPick(c.id)}
            className="rounded border px-3 py-2 disabled:opacity-60"
          >
            {c.name}
          </button>
        ))}
      </div>
      {answered ? (
        <button type="button" onClick={onAdvance} className="rounded bg-black px-4 py-2 text-white">
          Tap to continue
        </button>
      ) : (
        <div className="flex gap-2">
          <button type="button" disabled={shuffleUsed} onClick={onShuffle} className="rounded border px-3 py-2 disabled:opacity-40">
            ⇄ Shuffle
          </button>
          <button type="button" onClick={onAdvance} className="rounded border px-3 py-2">
            ⏩ Skip
          </button>
        </div>
      )}
    </div>
  );
}

function CongratsView({ earned, godMode, onCashOut }: { earned: number; godMode: boolean; onCashOut: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <h1 className="text-2xl font-bold">Congrats</h1>
      <div className="text-4xl">🪙</div>
      <p>
        You earned <b>{earned}</b> coins{godMode ? <span className="text-purple-600"> ⚡2×</span> : null}
      </p>
      <button type="button" onClick={onCashOut} className="rounded-full bg-black px-4 py-2 text-white">
        🤑 Cash Out
      </button>
    </div>
  );
}

function PlayAgainView({ onPlayAgain }: { onPlayAgain: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <h1 className="text-2xl font-bold">Play Again</h1>
      <button type="button" onClick={onPlayAgain} className="rounded bg-orange-500 px-4 py-2 text-white">
        Play Again Now
      </button>
    </div>
  );
}
