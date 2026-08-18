import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShop } from '../../src/hooks/useShop';
import { useActivateGodMode } from '../../src/hooks/useActivateGodMode';
import { AuraIcon } from '../../src/components/AuraIcon';
import { ScratchTile } from '../../src/components/scratch/ScratchTile';
import { ToyShadow } from '../../src/components/ToyShadow';
import { Wobble } from '../../src/components/Wobble';
import { AuthError } from '../../src/components/authKit';

/* 15A's Infinite Aura paywall — what replaced God Mode.

   The design's argument for the change, worth keeping next to the code: the old paywall sold *the
   answer*, and an answer is spent once. Nothing renewed, so there was no reason for a second month.
   Infinite Aura sells unlimited clues and first names instead — and a first name still isn't a whole
   person at a 300-student school, so the guessing survives the purchase.

   The scratch card is the pitch, not decoration: one clue free, two behind a coin, and the name on the
   rung coins can't reach. You can see the shape of what you don't have. */

/* A sample flame, not the reader's. The paywall has to show the ladder before you own any of it, and
   using someone's real locked flame here would mean rendering a clue we haven't been paid for. */
const SAMPLE = { poll: '🥵 HOTTEST IN THE JUNIOR CLASS', who: 'A girl', grade: '11th', initial: 'M', name: 'Maya' };

export default function InfiniteAura() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: shop } = useShop();
  const activate = useActivateGodMode();
  /* Demo-only. Scratching a tile here reveals the sample, spends nothing, and resets when the screen is
     left — it exists to show what a coin buys, not to hand one over. */
  const [demo, setDemo] = useState({ grade: false, initial: false });

  const gradeCost = shop?.clueGradeCost ?? 1;
  const initialCost = shop?.clueInitialCost ?? 1;

  // Already a member: this screen has nothing to sell, so send them to where the state is shown.
  const member = !!shop?.infiniteAura;

  return (
    <View className="flex-1 bg-ground px-[21px]" style={{ paddingTop: insets.top + 14 }}>
      <View className="flex-row justify-end">
        <Pressable onPress={() => router.back()} hitSlop={14}>
          <AuraIcon name="close" size={22} color="#727074" />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View className="mt-[2px] flex-row">
          <Wobble>
            <AuraIcon name="aura" size={38} color="#6BF2C2" />
          </Wobble>
        </View>
        {/* Two lines, two colours — the product name is the app's name doing something extra. */}
        <Text className="font-fredoka-700 mt-1 text-[38px] leading-[39px]" style={{ color: '#6BF2C2' }}>
          Infinite
        </Text>
        <Text className="font-fredoka-700 text-[38px] leading-[39px]" style={{ color: '#FF5CA8' }}>
          Aura
        </Text>
        <Text className="font-nunito-700 mt-2 text-[15px] leading-[21px] text-ink-secondary">
          Every clue on every flame, as many as you want — and their first name.
        </Text>

        {/* The ladder, as a scratch card. */}
        <View className="mt-4">
          <ToyShadow depth={6} shadowColor="#D9C7AF" backgroundColor="#FFF6E8" radius={26}>
            <View className="p-4">
              <Text className="font-nunito-900 text-[11.5px]" style={{ color: '#8B888D' }}>
                {SAMPLE.poll}
              </Text>
              {/* The two priced rungs are real, tappable scratch tiles rather than pictures of them.

                  Nothing is charged here — `demo` is local state and no mutation fires. That's the point:
                  the pitch is the feeling of the thing, and letting someone scratch one before paying
                  demonstrates it far better than a still image of foil. Tapping a tile on a paywall must
                  never take money, so the handler deliberately does nothing but flip local state. */}
              <View className="mt-3 gap-2">
                <View className="flex-row gap-2">
                  <ClueTile tone="free" caption="WHO" emoji="👧" value={SAMPLE.who} badge="FREE" />
                  <ScratchTile
                    open={demo.grade}
                    label="GRADE|SCRATCH IT OFF"
                    seed={4}
                    cost={gradeCost}
                    onScratch={() => setDemo(d => ({ ...d, grade: true }))}
                  >
                    <ClueFace tone="grade" caption="GRADE" emoji="🎓" value={SAMPLE.grade} />
                  </ScratchTile>
                </View>
                <View className="flex-row gap-2">
                  <ScratchTile
                    open={demo.initial}
                    label="INITIAL|SCRATCH IT OFF"
                    seed={19}
                    cost={initialCost}
                    onScratch={() => setDemo(d => ({ ...d, initial: true }))}
                  >
                    <ClueFace tone="initial" caption="INITIAL" emoji="🔤" value={SAMPLE.initial} />
                  </ScratchTile>
                  <ClueTile tone="infinite" caption="FIRST NAME" emoji="🙋" value={SAMPLE.name} badge="INFINITE" />
                </View>
              </View>
            </View>
          </ToyShadow>
        </View>

        <View className="mt-4 gap-2">
          <Benefit>Unlimited clues, no coins spent</Benefit>
          <Benefit>First names on every flame you get</Benefit>
          <Benefit>Works on the flames already sitting there</Benefit>
        </View>

        {/* Tiers without dollar amounts.

            The design prints $4.99 / $24.99 and notes "prices are placeholders". They stay out until
            StoreKit can supply them: a native app that shows a price next to a button which takes no
            money is both a revenue leak and a plausible Guideline 3.1.1 rejection. The *shape* of the
            offer — weekly versus a much cheaper semester — is the part that does the persuading, and it
            survives without the numbers. */}
        <View className="mt-4 flex-row gap-[11px]">
          <View className="flex-1 rounded-22 bg-surface px-[13px] py-[15px]">
            <Text className="font-nunito-900 text-[12px] text-ink-dim">WEEKLY</Text>
            <Text className="font-nunito-700 mt-1 text-[12px] text-ink-dim">every week</Text>
          </View>
          <View className="flex-1">
            <View style={{ position: 'absolute', top: -12, left: 11, zIndex: 1 }}>
              <View className="rounded-pill bg-pink px-[10px] py-1" style={{ transform: [{ rotate: '-3deg' }] }}>
                <Text className="font-nunito-900 text-[10.5px] text-white">BEST DEAL</Text>
              </View>
            </View>
            <ToyShadow depth={5} shadowColor="#3FBF95" backgroundColor="#6BF2C2" radius={22}>
              <View className="px-[13px] py-[15px]">
                <Text className="font-nunito-900 text-[12px]" style={{ color: '#12664C' }}>
                  SEMESTER
                </Text>
                <Text className="font-nunito-700 mt-1 text-[12px]" style={{ color: '#12664C' }}>
                  best value
                </Text>
              </View>
            </ToyShadow>
          </View>
        </View>

        {activate.isError && <AuthError message={(activate.error as Error).message} />}

        <View className="mt-5 mb-8 items-center gap-[11px]">
          {member ? (
            <>
              <View className="w-full items-center rounded-pill bg-surface py-[18px]">
                <Text className="font-fredoka-700 text-[20px]" style={{ color: '#6BF2C2' }}>
                  You have Infinite Aura
                </Text>
              </View>
              <Pressable onPress={() => router.replace('/shop')} hitSlop={8}>
                <Text className="font-nunito-800 text-[12.5px] text-ink-faint">See what's included →</Text>
              </Pressable>
            </>
          ) : (
            <>
              <View className="w-full">
                <ToyShadow
                  depth={5}
                  shadowColor="#C43A7C"
                  backgroundColor="#FF5CA8"
                  radius={9999}
                  onPress={() => activate.mutate(undefined, { onSuccess: () => router.replace('/shop') })}
                  disabled={activate.isPending}
                  style={activate.isPending ? { opacity: 0.6 } : undefined}
                >
                  <View className="items-center py-[18px]">
                    <Text className="font-fredoka-700 text-[20px] text-white">
                      {activate.isPending ? 'Turning it on…' : 'Try Infinite Aura'}
                    </Text>
                  </View>
                </ToyShadow>
              </View>
              {/* Says exactly what the button does. It grants the entitlement for free, because there is
                  no StoreKit product to charge against yet — so it must not claim a subscription. */}
              <Text className="font-nunito-700 text-center text-[12.5px] leading-[18px] text-ink-faint">
                Free while purchases aren't live yet. Nothing is charged, and nobody can see you have it.
              </Text>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function Benefit({ children }: { children: string }) {
  return (
    <View className="flex-row items-center gap-[11px]">
      <AuraIcon name="check" size={18} color="#6BF2C2" />
      <Text className="font-nunito-800 flex-1 text-[14.5px]" style={{ color: '#FCFCFA' }}>
        {children}
      </Text>
    </View>
  );
}

/* A revealed rung. Mint for the free one, pink for the one only a member reaches — the same two colours
   the rest of the app uses for "safe/included" and "the thing being sold". */
function ClueTile({
  tone,
  caption,
  emoji,
  value,
  badge
}: {
  tone: 'free' | 'infinite';
  caption: string;
  emoji: string;
  value: string;
  badge: string;
}) {
  const free = tone === 'free';
  /* Square, matching the scratch tiles beside it. These carried a fixed 104pt height from before the
     tiles became squares — the mint one got away with it because a plain View stretches to the row, but
     the pink one is wrapped in a ToyShadow that doesn't, so it sat two-thirds height next to its
     neighbours. All four tiles now derive their size the same way. */
  const body = (
    <View className="flex-1 items-center justify-center gap-[7px] px-[11px]" style={{ aspectRatio: 1 }}>
      <Text className="font-nunito-900 text-[9.5px]" style={{ color: free ? '#12664C' : '#FFD6E9', letterSpacing: 0.6 }}>
        {caption}
      </Text>
      <Text style={{ fontSize: 19 }}>{emoji}</Text>
      <Text className="font-fredoka-700 text-[21px] leading-[23px]" style={{ color: free ? '#0A3B2C' : '#FFFFFF' }}>
        {value}
      </Text>
      <Text className="font-nunito-900 text-[9px]" style={{ color: free ? '#12664C' : '#FFD6E9' }}>
        {badge}
      </Text>
    </View>
  );
  if (free) {
    return (
      <View className="flex-1 overflow-hidden rounded-22" style={{ backgroundColor: '#6BF2C2' }}>
        {body}
      </View>
    );
  }
  return (
    <View className="flex-1 overflow-hidden rounded-22" style={{ backgroundColor: '#FF5CA8' }}>
      {body}
    </View>
  );
}

/* What sits *under* the foil on a priced rung. Yellow for the grade, purple for the initial — 16A's
   colours, and both distinct from the free tile's mint and the members-only pink, so the four squares
   read as four different kinds of thing before any of them is opened. */
function ClueFace({
  tone,
  caption,
  emoji,
  value
}: {
  tone: 'grade' | 'initial';
  caption: string;
  emoji: string;
  value: string;
}) {
  const grade = tone === 'grade';
  return (
    <View
      className="flex-1 items-center justify-center gap-[7px] px-[11px]"
      style={{ backgroundColor: grade ? '#FFD84D' : '#7C5CFF' }}
    >
      <Text className="font-nunito-900 text-[9.5px]" style={{ color: grade ? '#7A5A00' : '#D6CBFF', letterSpacing: 0.6 }}>
        {caption}
      </Text>
      <Text style={{ fontSize: 19 }}>{emoji}</Text>
      <Text
        className="font-fredoka-700"
        style={{ fontSize: grade ? 21 : 28, lineHeight: grade ? 23 : 30, color: grade ? '#3A2A00' : '#FFFFFF' }}
      >
        {value}
      </Text>
    </View>
  );
}
