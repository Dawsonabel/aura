import { Pressable, Text, View } from 'react-native';
import type { RoundChoice, RoundPoll } from '@aura/api-client';
import { useAuraRound } from '../../src/hooks/useAuraRound';
import { useMe } from '../../src/hooks/useMe';

export default function Aura() {
  const { mode, poll, choices, count, total, answered, shuffleUsed, earned, pick, shuffle, advance, cashOut, playAgain } = useAuraRound();
  const { data: me } = useMe();

  if (mode === 'loading') return <LoadingView />;
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
