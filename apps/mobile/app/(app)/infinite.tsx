import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShop } from '../../src/hooks/useShop';
import { useActivateInfiniteAura } from '../../src/hooks/useActivateInfiniteAura';
import { AuraIcon } from '../../src/components/AuraIcon';
import { ToyShadow } from '../../src/components/ToyShadow';
import { Wobble } from '../../src/components/Wobble';
import { AuthError } from '../../src/components/authKit';

/* The Infinite Aura paywall — what replaced Infinite Aura.

   The design's argument for the change, worth keeping next to the code: the old paywall sold *the
   answer*, and an answer is spent once. Nothing renewed, so there was no reason for a second month.
   This sells a daily allowance instead — two flips, back tomorrow — and a first name still isn't a
   whole person at a 300-student school, so the guessing survives the purchase.

   The pitch used to be a scratch card: one clue free, two behind a coin, and the name on the rung
   coins couldn't reach. The clue ladder is gone, and with it the reason to render foil here. What
   sells now is the only transaction left in the product — a card face down, and the same card turned
   over — so the pitch is those two states side by side. */

/* A sample card, not the reader's. The paywall has to show the before and after without opening
   anything real: rendering someone's actual locked card here would hand over a name nobody paid for. */
const SAMPLE = { poll: '🥵 HOTTEST IN THE JUNIOR CLASS', who: 'Girl', grade: '11th grade', name: 'Maya' };

export default function InfiniteAura() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: shop } = useShop();
  const activate = useActivateInfiniteAura();

  const flips = shop?.dailyFlips ?? 2;
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
          {flips} flips a day. Each one turns a card over and keeps the name.
        </Text>

        {/* Before and after, side by side. The whole product in one row: what everybody sees, and what
            a flip turns it into. Static — nothing here is tappable, because there is nothing to demo
            any more and a paywall that looks like it opened a card would be lying about what it did. */}
        <View className="mt-4 flex-row items-center gap-[10px]">
          <SampleCard state="down" />
          <View className="items-center" style={{ width: 26 }}>
            <AuraIcon name="chevronRight" size={18} color="#6BF2C2" />
          </View>
          <SampleCard state="up" />
        </View>

        <View className="mt-4 gap-2">
          <Benefit>{`${flips} name reveals every day, back again tomorrow`}</Benefit>
          <Benefit>Their grade comes with the name</Benefit>
          <Benefit>Works on the cards already waiting for you</Benefit>
          <Benefit>They never find out you flipped them</Benefit>
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

/* The two states of a card, drawn to match the real ones on the Aura tab.

   Face down is the dark card with the sender's accent and their gender — what everyone gets for free.
   Turned over is the cream card the app uses for good news, carrying the name, the grade and the
   superlative. Deliberately the same shapes and colours as the live grid: a paywall that invents its
   own illustration is selling something the app doesn't then deliver. */
function SampleCard({ state }: { state: 'down' | 'up' }) {
  const accent = '#FF5CA8'; // the sample sender is a girl; the real cards take this from her gender

  if (state === 'down') {
    return (
      <View
        className="flex-1 items-center justify-center gap-[7px] px-[10px]"
        style={{ height: 148, borderRadius: 18, backgroundColor: '#2C2A2D', borderWidth: 2.5, borderColor: accent }}
      >
        <View
          className="items-center justify-center"
          style={{ width: 40, height: 40, borderRadius: 99, backgroundColor: '#403E41' }}
        >
          <Text style={{ fontSize: 17 }}>🥵</Text>
        </View>
        <Text className="font-fredoka-700 text-[19px] leading-[21px]" style={{ color: accent }}>
          {SAMPLE.who}
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <ToyShadow depth={5} shadowColor="#D9C7AF" backgroundColor="#FFF6E8" radius={18}>
        <View className="items-center justify-center gap-[5px] px-[10px]" style={{ height: 143 }}>
          <View
            className="items-center justify-center"
            style={{ width: 40, height: 40, borderRadius: 99, backgroundColor: accent }}
          >
            <Text className="font-fredoka-700 text-[18px] text-white">{SAMPLE.name.charAt(0)}</Text>
          </View>
          <Text className="font-fredoka-700 text-[19px] leading-[21px]" style={{ color: '#2D2A2E' }}>
            {SAMPLE.name}
          </Text>
          <Text className="font-nunito-900 text-[10.5px]" style={{ color: '#6F6552', letterSpacing: 0.4 }}>
            {SAMPLE.grade.toUpperCase()}
          </Text>
          <Text
            className="font-nunito-900 text-[8.5px]"
            numberOfLines={1}
            style={{ color: '#A79B86', letterSpacing: 0.4 }}
          >
            {SAMPLE.poll.replace('🥵 ', '')}
          </Text>
        </View>
      </ToyShadow>
    </View>
  );
}
