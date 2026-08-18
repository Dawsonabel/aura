import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming, Easing } from 'react-native-reanimated';
import { AuraFoil, FOIL_COLOR, FoilLabel } from '../AuraFoil';
import { AuraIcon } from '../AuraIcon';
import { COIN_FILL, COIN_INK, COIN_SHADOW } from '../coin';
import { ToyShadow } from '../ToyShadow';
import { ScratchFoilSkia } from './ScratchFoilSkia';
import { SCRATCH_MS, pointAt } from './swipes';
import { hasSkia } from './skiaAvailable';

/* One tile of 16A's scratch card.

   Three states, and the middle one is the whole point:
     sealed     — foil, a label, and the price
     scratching — the rake animation, with a coin riding it
     open       — the face, with dust left behind

   **Tap, never drag.** The design cut finger-scrubbing deliberately: "a paid reveal shouldn't need
   technique". You've already paid by the time the coin moves, so making the reveal a skill check would
   only be a way to feel bad about a purchase.

   Degrades rather than breaks. Where Skia isn't compiled in — Expo Go, or a dev client built before the
   dependency landed — the tile still works: it shows the static foil and opens instantly on tap. The
   clue is what was bought; the animation is how it's delivered. */

export function ScratchTile({
  open,
  label,
  seed = 0,
  cost,
  free,
  freeLabel = 'FREE TODAY',
  disabled,
  onScratch,
  children
}: {
  /** Already paid for — renders the face, no foil. */
  open: boolean;
  /** Foil caption, pipe-separated lines: "INITIAL|SCRATCH IT OFF". */
  label: string;
  seed?: number;
  /** Coins this tile costs. Ignored when `free` is set. */
  cost: number;
  /** True when this tile costs nothing, so the badge says so instead of showing a price. */
  free?: boolean;
  /** What "free" is called here. "FREE TODAY" is the daily tile; a member's tiles are just FREE. */
  freeLabel?: string;
  disabled?: boolean;
  /** Fires on tap. Charge here — the animation is presentation, not a confirmation step. */
  onScratch: () => void;
  /** The face under the foil. Always mounted, so nothing appears out of nowhere at the end. */
  children: ReactNode;
}) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [scratching, setScratching] = useState(false);
  const pop = useSharedValue(1);
  /* Resolved once, not per render: the canvas is only mounted at rest when it can actually paint, and
     the sealed state has to pick the same foil the tap will animate. */
  const skiaReady = hasSkia() && !!size;

  /* The payoff: the value pops once the raking stops. 16A is explicit that the reward lands *after* the
     rake, not during it — that's the scratch-card beat. */
  const faceStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const celebrate = () => {
    pop.value = withSequence(
      withTiming(1.09, { duration: 140, easing: Easing.bezier(0.2, 1.6, 0.4, 1) }),
      withTiming(1, { duration: 220, easing: Easing.bezier(0.2, 0.9, 0.3, 1) })
    );
    setScratching(false);
  };

  function handlePress() {
    if (open || scratching || disabled) return;
    onScratch();
    // No Skia: the clue still opens, just without the rake.
    if (hasSkia()) setScratching(true);
    else celebrate();
  }

  const showFoil = !open && !scratching;

  return (
    <Pressable
      onPress={handlePress}
      disabled={open || disabled}
      className="flex-1 overflow-hidden rounded-22"
      style={{ aspectRatio: 1 }}
      onLayout={e => {
        const { width, height } = e.nativeEvent.layout;
        setSize(prev => (prev && prev.w === width && prev.h === height ? prev : { w: width, h: height }));
      }}
    >
      {/* The face sits underneath the foil, which is removed from on top of it — the value is never
          conjured into existence at the end.

          It is *not* mounted while the tile is sealed, though. A cover that has to measure itself before
          it paints can't be trusted to win a race against the thing it's covering: mount both together
          and the answer is on screen, unobscured, for however many frames the cover takes to come up.
          Nothing that hasn't been paid for should exist in the tree at all. The face mounts on the same
          commit that starts the rake, under a canvas that is already painted and has no holes in it yet. */}
      {(open || scratching) && <Animated.View style={[{ flex: 1 }, faceStyle]}>{children}</Animated.View>}

      {/* Crumbs stay for good on an opened tile.

          They're painted inside the Skia canvas during the rake, but that canvas unmounts the moment the
          animation ends and took the dust with it — so a scratched tile went back to looking untouched.
          The design is explicit that it shouldn't: the dust is the receipt for the coin. This also covers
          tiles that were already open when the screen loaded, which never had a canvas at all. */}
      {open && <AuraFoil dust seed={seed} />}

      {/* Flat foil colour, under both textured foils, up on the very first frame.

          Neither texture can be: the SVG foil measures itself with onLayout before it draws a single
          node, and the Skia canvas can't mount until this component's own onLayout has given it a size —
          then needs a frame or two more to paint. Between them there was also a swap (SVG out, Skia in
          the moment `size` resolves) with the same gap in the middle. This rect needs no measurement, so
          the tile is opaque from the start and the texture lands on top of it invisibly. */}
      {showFoil && (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: FOIL_COLOR }}
        />
      )}

      {/* The sealed foil.

          With Skia present this is the *same canvas* that will do the raking, mounted and painted before
          the tap so there's no swap and no frame where the face shows through. Without Skia it's the
          static SVG foil, which has nothing to warm up. */}
      {/* `|| scratching` matters: the caller marks the clue open the moment it's tapped (it has been paid
          for by then), so keying purely off `!open` would unmount the canvas at the exact instant the
          rake was meant to start. */}
      {(!open || scratching) && skiaReady && size && (
        <ScratchFoilSkia width={size.w} height={size.h} seed={seed} running={scratching} onDone={celebrate} />
      )}

      {showFoil && (
        <>
          {/* No `label` here — the caption is drawn below, over whichever foil is painting. */}
          {!skiaReady && <AuraFoil seed={seed} />}
          {size && <FoilLabel label={label} w={size.w} />}
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 11, alignItems: 'center' }}>
            <ToyShadow depth={2} shadowColor={COIN_SHADOW} backgroundColor={COIN_FILL} radius={9999}>
              <View className="flex-row items-center gap-1 px-[10px] py-[5px]">
                {free ? (
                  <Text className="font-nunito-900 text-[10.5px]" style={{ color: COIN_INK }}>
                    {freeLabel}
                  </Text>
                ) : (
                  <>
                    <AuraIcon name="coin" size={13} color={COIN_INK} />
                    <Text className="font-nunito-900 text-[10.5px]" style={{ color: COIN_INK }}>
                      {cost}
                    </Text>
                  </>
                )}
              </View>
            </ToyShadow>
          </View>
        </>
      )}

      {/* The coin rides above the canvas, and only while raking. */}
      {scratching && size && <ScratchCoin width={size.w} height={size.h} />}
    </Pressable>
  );
}

/* The coin doing the work. An RN view rather than a Skia node, because it sits *above* the canvas and
   needs no compositing with it — and because Reanimated drives it on the same UI thread as the erase,
   so the two stay in step without sharing a frame loop.

   It has weight, per the design: a turn and a half of rotation, a tilt that wobbles as it drags, and a
   12% swell at mid-swipe as if pressed into the card. */
function ScratchCoin({ width, height }: { width: number; height: number }) {
  const t = useSharedValue(0);

  // An Effect, not a lazy useState initialiser — starting an animation is a side effect, and doing it
  // during render means it fires again on any re-render React decides to throw away.
  useEffect(() => {
    t.value = withTiming(1, { duration: SCRATCH_MS, easing: Easing.linear });
  }, [t]);

  const style = useAnimatedStyle(() => {
    const p = pointAt(t.value, width, height);
    const tilt = Math.sin(t.value * Math.PI * 5) * 10;
    return {
      transform: [
        { translateX: p.x - 19 },
        { translateY: p.y - 19 },
        { rotate: `${t.value * 520 + tilt}deg` },
        { scale: 1 + Math.sin(t.value * Math.PI) * 0.12 }
      ]
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: 0,
          top: 0,
          width: 38,
          height: 38,
          borderRadius: 100,
          backgroundColor: COIN_FILL,
          alignItems: 'center',
          justifyContent: 'center'
        },
        style
      ]}
    >
      <AuraIcon name="coin" size={22} color={COIN_INK} />
    </Animated.View>
  );
}
