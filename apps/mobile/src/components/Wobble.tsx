import type { ReactNode } from 'react';
import { useEffect } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, Easing } from 'react-native-reanimated';

/* -2.5deg -> 2.5deg -> -2.5deg, 3s, ease-in-out, infinite — applies to the emoji glyph itself,
   never a container (see README's "Wobble" interaction). */
export function Wobble({ children }: { children: ReactNode }) {
  const rotate = useSharedValue(-2.5);

  useEffect(() => {
    rotate.value = withRepeat(
      withSequence(
        withTiming(2.5, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(-2.5, { duration: 1500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, [rotate]);

  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotate.value}deg` }] }));

  return <Animated.View style={style}>{children}</Animated.View>;
}
