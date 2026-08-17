import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RoundChoice, RoundPoll } from '@aura/api-client';
import { useAuraRound } from '../../src/hooks/useAuraRound';
import { useMe } from '../../src/hooks/useMe';
import { ToyShadow } from '../../src/components/ToyShadow';
import { Wobble } from '../../src/components/Wobble';

// Cycles pink -> mint -> purple -> yellow in grid order, per the design tokens' avatar rule.
const ACCENTS = [
  { bg: '#FF5CA8', shadow: '#C43A7C', ink: '#FFFFFF' },
  { bg: '#6BF2C2', shadow: '#3FBF95', ink: '#0A3B2C' },
  { bg: '#7C5CFF', shadow: '#5334D6', ink: '#FFFFFF' },
  { bg: '#FFD84D', shadow: '#D4AC17', ink: '#3A2A00' }
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

export default function Aura() {
  const { mode, poll, choices, count, total, pick, shuffle, advance } = useAuraRound();
  const { data: me } = useMe();
  const [pickedId, setPickedId] = useState<string | null>(null);
  // See AuthShell: the spec's flat "58px top" collides with the Dynamic Island on real hardware.
  const insets = useSafeAreaInsets();

  function handlePick(targetId: string) {
    if (pickedId) return;
    setPickedId(targetId);
    pick(targetId);
    // The design has no confirm step — tapping a candidate IS the vote, and the next question
    // slides in on its own. 300ms lets the avatar-flash read before advancing.
    setTimeout(() => {
      advance();
      setPickedId(null);
    }, 300);
  }

  return (
    <View className="flex-1 bg-ground px-[21px]" style={{ paddingTop: insets.top + 14 }}>
      <StatusRow candy={me?.coins ?? 0} />

      {mode === 'poll' && poll ? (
        <>
          <ProgressRow count={count} total={total} />
          <PromptCard poll={poll} />
          <CandidateGrid choices={choices} pickedId={pickedId} onPick={handlePick} />
          <UtilityRow onNewFour={shuffle} onSkip={advance} disabled={pickedId !== null} />
        </>
      ) : (
        <LoadingSkeleton />
      )}
    </View>
  );
}

function StatusRow({ candy }: { candy: number }) {
  return (
    <View className="flex-row items-center justify-between">
      {/* Streak has no backend field yet (no `streak`/`playedToday` anywhere in the API) — shown
          as a static placeholder pending that, not real data. Flagged in the handoff report. */}
      <ToyShadow depth={3} shadowColor="#C4501E" backgroundColor="#FF7A3D" radius={9999}>
        <View className="flex-row items-center gap-[7px] px-[14px] py-[7px]">
          <Text style={{ fontSize: 15 }}>🔥</Text>
          <Text className="font-nunito-900 text-[15px] text-white">12</Text>
          <Text className="font-nunito-800 text-[13px]" style={{ color: '#FFE0CE' }}>
            days
          </Text>
        </View>
      </ToyShadow>

      <View className="flex-row items-center gap-[7px] rounded-pill bg-surface px-[14px] py-[7px]">
        <Text style={{ fontSize: 14 }}>🍬</Text>
        <Text className="font-nunito-900 text-[15px] text-white">{candy}</Text>
      </View>
    </View>
  );
}

function ProgressRow({ count, total }: { count: number; total: number }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <View className="mt-[24px] flex-row items-center gap-[6px]">
      <View className="h-[10px] flex-1 overflow-hidden rounded-pill bg-surface">
        <View className="h-full rounded-pill bg-mint" style={{ width: `${pct}%` }} />
      </View>
      <Text className="font-nunito-800 text-[13px] text-ink-muted">
        {count}/{total}
      </Text>
    </View>
  );
}

function PromptCard({ poll }: { poll: RoundPoll }) {
  return (
    <View className="mt-[26px] rounded-26 bg-surface p-5" style={{ position: 'relative' }}>
      <View
        className="rounded-pill bg-yellow px-3 py-[5px]"
        style={{ position: 'absolute', top: -14, left: 20, transform: [{ rotate: '-3deg' }] }}
      >
        <Text className="font-nunito-900 text-[12px]" style={{ color: '#3A2A00' }}>
          EVERYONE'S VOTING ON THIS
        </Text>
      </View>

      <Wobble>
        <Text style={{ fontSize: 40 }}>{poll.emoji}</Text>
      </Wobble>

      <Text className="font-fredoka-700 mt-2 text-[31px] leading-[33px] text-white">{poll.text}</Text>
      <Text className="font-nunito-700 mt-2 text-[13.5px] text-ink-muted">
        They'll know they got picked. Never that it was you.
      </Text>
    </View>
  );
}

function CandidateGrid({
  choices,
  pickedId,
  onPick
}: {
  choices: RoundChoice[];
  pickedId: string | null;
  onPick: (targetId: string) => void;
}) {
  const rows = [choices.slice(0, 2), choices.slice(2, 4)];

  return (
    <View className="mt-[18px] gap-3">
      {rows.map((row, i) => (
        <View key={i} className="flex-row gap-3">
          {row.map((c, j) => (
            <CandidateCard
              key={c.id}
              choice={c}
              accent={ACCENTS[(i * 2 + j) % ACCENTS.length]}
              picked={c.id === pickedId}
              disabled={pickedId !== null}
              onPress={() => onPick(c.id)}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

// Grade/school meta ("11th · Lakeview") is in the design but RoundChoice has no such field
// server-side today — placeholder copy until that's added to the schema, flagged in the report.
function CandidateCard({
  choice,
  accent,
  picked,
  disabled,
  onPress
}: {
  choice: RoundChoice;
  accent: { bg: string; shadow: string; ink: string };
  picked: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const avatarAccent = picked ? { bg: '#FF5CA8', shadow: '#C43A7C', ink: '#FFFFFF' } : accent;

  return (
    <View className="flex-1">
      <ToyShadow depth={5} shadowColor="#D9C7AF" backgroundColor="#FFF6E8" radius={24} onPress={onPress} disabled={disabled}>
        <View className="gap-[11px] px-[14px] py-4">
          <ToyShadow depth={3} shadowColor={avatarAccent.shadow} backgroundColor={avatarAccent.bg} radius={9999}>
            <View className="h-[54px] w-[54px] items-center justify-center">
              <Text className="font-fredoka-700 text-[21px]" style={{ color: avatarAccent.ink }}>
                {initials(choice.name)}
              </Text>
            </View>
          </ToyShadow>
          <View>
            <Text className="font-nunito-900 text-[17px]" style={{ color: '#2D2A2E' }}>
              {choice.name}
            </Text>
            <Text className="font-nunito-700 text-[13px]" style={{ color: '#8B888D' }}>
              11th · Lakeview
            </Text>
          </View>
        </View>
      </ToyShadow>
    </View>
  );
}

function UtilityRow({
  onNewFour,
  onSkip,
  disabled
}: {
  onNewFour: () => void;
  onSkip: () => void;
  disabled: boolean;
}) {
  return (
    <View className="mt-4 flex-row gap-3">
      <Pressable
        disabled={disabled}
        onPress={onNewFour}
        className="flex-1 items-center rounded-pill bg-surface py-[13px]"
        style={{ opacity: disabled ? 0.5 : 1 }}
      >
        <Text className="font-nunito-800 text-[15px] text-ink-secondary">🔄 New four</Text>
      </Pressable>
      <Pressable
        disabled={disabled}
        onPress={onSkip}
        className="flex-1 items-center rounded-pill bg-surface py-[13px]"
        style={{ opacity: disabled ? 0.5 : 1 }}
      >
        <Text className="font-nunito-800 text-[15px] text-ink-secondary">Skip ⏭</Text>
      </Pressable>
    </View>
  );
}

// "Never a spinner over the whole screen" — candidate cards pulse as cream blocks instead.
function LoadingSkeleton() {
  return (
    <View className="mt-[26px] gap-3">
      <View className="h-[188px] rounded-26 bg-surface" />
      <View className="mt-[18px] gap-3">
        <View className="flex-row gap-3">
          <View className="h-[130px] flex-1 rounded-24 bg-cream" style={{ opacity: 0.35 }} />
          <View className="h-[130px] flex-1 rounded-24 bg-cream" style={{ opacity: 0.35 }} />
        </View>
        <View className="flex-row gap-3">
          <View className="h-[130px] flex-1 rounded-24 bg-cream" style={{ opacity: 0.35 }} />
          <View className="h-[130px] flex-1 rounded-24 bg-cream" style={{ opacity: 0.35 }} />
        </View>
      </View>
    </View>
  );
}
