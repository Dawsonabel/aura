import { Pressable, Text, View } from 'react-native';
import { useFlames } from '../hooks/useFlames';
import { useActivateGodMode } from '../hooks/useActivateGodMode';
import { Overlay } from './Overlay';

const BENEFITS = [
  { emoji: '🔓', title: 'Reveal Two Names Per Week', sub: 'Unmask anyone who picks you twice' },
  { emoji: '⚡', title: 'Get Unlimited Hints', sub: 'See the first letter of everyone who picks you' },
  { emoji: '🪙', title: 'Get Double Coins', sub: 'Earn 2× coins on every poll you answer' },
  { emoji: '🔔', title: 'Secret Crush Alerts', sub: 'Know when someone adds themself to your polls' },
  { emoji: '🕵️', title: 'Send Polls Anonymously', sub: 'Your votes can never be traced back to you' }
];

export function GodModeOverlay({ onClose }: { onClose: () => void }) {
  const { data: flames } = useFlames();
  const activateGodMode = useActivateGodMode();
  // Real count, not the old app's fabricated "3 people like you" teaser with fake initials.
  const lockedCount = flames?.flames.filter(f => !f.revealed && !f.godMode).length ?? 0;

  return (
    <Overlay onClose={onClose}>
      <View className="items-center">
        <Text className="text-4xl">👑</Text>
        <Text className="text-2xl font-bold">GOD MODE</Text>
        <Text className="text-sm text-gray-500">See who likes you on Aura</Text>
      </View>

      {lockedCount > 0 && (
        <Text className="mt-4 text-center text-sm">
          🔥 {lockedCount} {lockedCount === 1 ? 'person likes' : 'people like'} you
        </Text>
      )}

      <View className="mt-4 gap-3">
        {BENEFITS.map(b => (
          <View key={b.title} className="flex-row items-start gap-2">
            <Text className="text-xl">{b.emoji}</Text>
            <View className="flex-1">
              <Text className="text-sm font-bold">{b.title}</Text>
              <Text className="text-sm text-gray-500">{b.sub}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* legacyGodMode is a free instant-unlock mutation — no payment is actually collected here
          (real StoreKit2 IAP is Phase 5 / Shop + God Mode). The copy below must not claim a real
          charge: a native, App-Store-distributed app showing a priced purchase button that
          doesn't charge anything is both a revenue leak and a plausible App Store Guideline 3.1.1
          rejection (misleading/non-functional purchase button). Web's copy is unchanged — it's a
          website, not reviewed by Apple, so the same risk doesn't apply there. */}
      <Pressable
        onPress={() => activateGodMode.mutate(undefined, { onSuccess: onClose })}
        className="mt-4 rounded bg-black px-4 py-2"
      >
        <Text className="text-center text-white">Try God Mode Free</Text>
      </Pressable>
      {activateGodMode.isError && <Text className="text-sm text-red-600">{(activateGodMode.error as Error).message}</Text>}
      <Text className="mt-2 text-center text-xs text-gray-500">
        Free preview while purchases aren't live yet · 100% private — no one can see you have God Mode.
      </Text>
    </Overlay>
  );
}
