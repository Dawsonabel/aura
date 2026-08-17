import { createFileRoute } from '@tanstack/react-router';
import type { RoundChoice, RoundPoll } from '@aura/api-client';
import { useAuraRound } from '../hooks/useAuraRound';
import { useMe } from '../hooks/useMe';

export const Route = createFileRoute('/_app/aura')({
  component: Aura
});

export function Aura() {
  const { mode, poll, choices, count, total, answered, shuffleUsed, earned, pick, shuffle, advance, cashOut, playAgain, retry } =
    useAuraRound();
  const { data: me } = useMe();

  if (mode === 'loading') return <LoadingView />;
  /* Before the shared hook gained these, a failed startRound left mode at 'loading' and this screen
     showed "Loading…" forever. Plain treatment here — apps/web has no design pass for state screens
     (10A is the mobile set) — but a dead end with a retry beats a dead end without one. */
  if (mode === 'failed') return <RoundProblemView title="Today's round didn't load." onRetry={retry} />;
  if (mode === 'empty')
    return <RoundProblemView title="No questions are set up for your school yet." onRetry={retry} />;
  if (mode === 'congrats') return <CongratsView earned={earned} godMode={!!me?.godMode} onCashOut={cashOut} />;
  if (mode === 'playagain') return <PlayAgainView onPlayAgain={playAgain} />;

  if (!poll) return <LoadingView />;

  return (
    <PollView
      poll={poll}
      choices={choices}
      count={count}
      total={total}
      answered={answered}
      shuffleUsed={shuffleUsed}
      onPick={pick}
      onShuffle={shuffle}
      onAdvance={advance}
    />
  );
}

function RoundProblemView({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    <main className="p-4">
      <p className="mb-3">{title}</p>
      <button type="button" onClick={onRetry} className="rounded border px-3 py-2">
        Try again
      </button>
    </main>
  );
}

function LoadingView() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2">
      <div className="text-2xl font-bold">AURA</div>
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
