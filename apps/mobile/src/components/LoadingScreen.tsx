import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import { AuthBrand } from './authKit';

/* 9A "Loading — the wordmark, breathing". The cold-start screen: the AURA wordmark centered on the
   ground colour, scaling 1 → 1.055 on a 2.6s loop while its shadow stretches 4px → 7px and a pink
   glow behind it breathes from 16% → 30% opacity. No spinner, no percentage. */

const CYCLE_MS = 1300; // 1300 in + 1300 out = the design's 2.6s loop
const MIN_VISIBLE_MS = 600; // a fast start shouldn't flash the screen up and rip it away
const FADE_MS = 200;

/* 10A's slow-connection state: at 6s the same breathing wordmark gains a line of copy and a retry.
   Nothing else changes — the design is explicit that this is the loading screen continuing, not a
   new screen, because it is still trying. */
const SLOW_MS = 6000;

/* At 15s we stop covering the child so its own failure state can take over — for `me` that's 10A's
   full-screen "We can't load your account", which carries the mandatory sign-out escape. Sitting on
   an infinite wordmark would strand a user with no way out. */
const GIVE_UP_MS = 15000;

export function LoadingScreen({ slow = false, onRetry }: { slow?: boolean; onRetry?: () => void }) {
  /* One Animated.Value drives all three interpolations, per the design note that they must never
     drift apart. That forces useNativeDriver: false — textShadowOffset has no native equivalent, and
     mixing drivers on one value is an error. The tradeoff is real (this animates on the JS thread,
     during startup, when that thread is busiest) but a shared clock matters more than a few dropped
     frames on a screen whose whole job is to look calm. */
  const breath = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const easing = Easing.inOut(Easing.ease);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: CYCLE_MS, easing, useNativeDriver: false }),
        Animated.timing(breath, { toValue: 0, duration: CYCLE_MS, easing, useNativeDriver: false })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [breath]);

  const scale = breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.055] });
  const shadowHeight = breath.interpolate({ inputRange: [0, 1], outputRange: [4, 7] });
  const glowOpacity = breath.interpolate({ inputRange: [0, 1], outputRange: [0.16, 0.3] });
  const glowScale = breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });

  return (
    <View className="flex-1 items-center justify-center gap-[26px] bg-ground px-8">
      <View className="items-center justify-center">
        {/* A real radial gradient, via RN 0.86's experimental_backgroundImage — the older trick of
            stacking translucent discs leaves visible edges, and this screen is mostly glow. */}
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: 210,
            height: 210,
            borderRadius: 105,
            experimental_backgroundImage: 'radial-gradient(circle, #FF5CA8 0%, rgba(255,92,168,0) 70%)',
            opacity: glowOpacity,
            transform: [{ scale: glowScale }]
          }}
        />
        <Animated.View style={{ transform: [{ scale }] }}>
          <AuthBrand fontSize={64} letterSpacing={-0.5} shadowHeight={shadowHeight} />
        </Animated.View>
      </View>

      {/* Appears at SLOW_MS. The wordmark keeps breathing above it — we are still trying, and the
          copy says so rather than implying the attempt has stopped. */}
      {slow && (
        <View className="items-center gap-[14px]">
          <Text className="font-nunito-800 text-center text-[14.5px] leading-[20px] text-ink-muted">
            This is taking longer than it should. Still trying.
          </Text>
          {onRetry && (
            <Pressable onPress={onRetry} className="rounded-pill bg-surface px-[22px] py-3">
              <Text className="font-nunito-900 text-[14px] text-ink-secondary">Try again</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

/** Covers `children` with the loading screen while `loading`, honouring 9A's hold and fade timings. */
export function LoadingGate({
  loading,
  onRetry,
  children
}: {
  loading: boolean;
  /** Offered on the slow-connection state at 6s. */
  onRetry?: () => void;
  children: ReactNode;
}) {
  const [covering, setCovering] = useState(loading);
  const [slow, setSlow] = useState(false);
  const fade = useRef(new Animated.Value(1)).current;
  const shownAt = useRef(Date.now());

  useEffect(() => {
    if (loading) {
      setCovering(true);
      setSlow(false);
      fade.setValue(1);
      shownAt.current = Date.now();
      return;
    }
    if (!covering) return;
    // Hold out the remainder of the 600ms minimum, then fade. Measured from wall-clock rather than
    // counted down, so backgrounding the app mid-load can't leave the cover up.
    const wait = Math.max(0, MIN_VISIBLE_MS - (Date.now() - shownAt.current));
    const id = setTimeout(() => {
      Animated.timing(fade, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(
        ({ finished }) => {
          if (finished) setCovering(false);
        }
      );
    }, wait);
    return () => clearTimeout(id);
  }, [loading, covering, fade]);

  // Two escalations on one clock: copy at 6s, then hand over to the child's own failure state at 15s.
  useEffect(() => {
    if (!loading) return;
    const slowId = setTimeout(() => setSlow(true), SLOW_MS);
    const giveUpId = setTimeout(() => setCovering(false), GIVE_UP_MS);
    return () => {
      clearTimeout(slowId);
      clearTimeout(giveUpId);
    };
  }, [loading]);

  return (
    <View className="flex-1">
      {children}
      {covering && (
        <Animated.View
          /* Untouchable until the slow state appears — before that there's nothing to tap, and
             swallowing touches over a screen that's about to be replaced feels broken. */
          pointerEvents={slow ? 'auto' : 'none'}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: fade }}
        >
          <LoadingScreen slow={slow} onRetry={onRetry} />
        </Animated.View>
      )}
    </View>
  );
}
