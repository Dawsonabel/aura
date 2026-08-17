import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useStartRound, type RoundChoice, type RoundPoll } from '../../src/hooks/useStartRound';
import { useVote } from '../../src/hooks/useVote';
import { useCompleteRound } from '../../src/hooks/useCompleteRound';
import { useMe } from '../../src/hooks/useMe';

type Mode = 'loading' | 'poll' | 'congrats' | 'playagain';

function shuffled<T>(items: T[]): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function Aura() {
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
    // Fire-and-forget, matching the web app's optimistic UI — the grid locks immediately rather
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
    <View className="flex-1 items-center justify-center gap-2">
      <Text className="text-2xl font-bold">AURA</Text>
      <Text className="text-gray-500">Loading Polls</Text>
    </View>
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
    <View className="gap-4">
      <Text className="text-sm text-gray-500">
        {count} of {total}
      </Text>
      <Text className="text-4xl">{poll.emoji}</Text>
      <Text className="text-xl font-semibold">{poll.text}</Text>
      <View className="flex-row flex-wrap gap-2">
        {choices.map(c => (
          <Pressable
            key={c.id}
            disabled={answered}
            onPress={() => onPick(c.id)}
            className={`rounded border px-3 py-2 ${answered ? 'opacity-60' : ''}`}
          >
            <Text>{c.name}</Text>
          </Pressable>
        ))}
      </View>
      {answered ? (
        <Pressable onPress={onAdvance} className="rounded bg-black px-4 py-2">
          <Text className="text-center text-white">Tap to continue</Text>
        </Pressable>
      ) : (
        <View className="flex-row gap-2">
          <Pressable disabled={shuffleUsed} onPress={onShuffle} className={`rounded border px-3 py-2 ${shuffleUsed ? 'opacity-40' : ''}`}>
            <Text>⇄ Shuffle</Text>
          </Pressable>
          <Pressable onPress={onAdvance} className="rounded border px-3 py-2">
            <Text>⏩ Skip</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function CongratsView({ earned, godMode, onCashOut }: { earned: number; godMode: boolean; onCashOut: () => void }) {
  return (
    <View className="flex-1 items-center justify-center gap-4">
      <Text className="text-2xl font-bold">Congrats</Text>
      <Text className="text-4xl">🪙</Text>
      <Text className="text-center">
        You earned <Text className="font-bold">{earned}</Text> coins
        {godMode ? <Text className="text-purple-600"> ⚡2×</Text> : null}
      </Text>
      <Pressable onPress={onCashOut} className="rounded-full bg-black px-4 py-2">
        <Text className="text-white">🤑 Cash Out</Text>
      </Pressable>
    </View>
  );
}

function PlayAgainView({ onPlayAgain }: { onPlayAgain: () => void }) {
  return (
    <View className="flex-1 items-center justify-center gap-4">
      <Text className="text-2xl font-bold">Play Again</Text>
      <Pressable onPress={onPlayAgain} className="rounded bg-orange-500 px-4 py-2">
        <Text className="text-white">Play Again Now</Text>
      </Pressable>
    </View>
  );
}
