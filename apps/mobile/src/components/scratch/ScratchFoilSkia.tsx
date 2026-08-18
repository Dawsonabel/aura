import { useEffect } from 'react';
import { useDerivedValue, useSharedValue, withTiming, Easing, runOnJS } from 'react-native-reanimated';
import { GIVE_UP_AT, SCRATCH_MS, SWIPE_COUNT, pointAt, rnd } from './swipes';
import { getSkia } from './skiaAvailable';

/* 16A's scratch-off, in Skia.

   Only ever rendered when getSkia() has confirmed the native side exists — ScratchTile does that check.
   Importing this module is safe (the require is inside getSkia), but rendering it without Skia is not.

   How the erase works: everything is drawn inside a <Group layer>, which gives Skia an offscreen buffer,
   and the rake strokes are painted into it with blendMode="clear". That's the direct equivalent of the
   design's canvas `destination-out` — it punches real holes rather than covering the foil with the
   card's colour, which matters because the card underneath is a different colour per tile.

   The whole animation runs off one Reanimated shared value on the UI thread, so it keeps its timing
   while JS is busy — which it will be, since the tap that starts it also fires the reveal mutation. */

const FOIL = '#B0AEB2';
const SPECK = 'rgba(90,88,92,0.30)';
const STREAK = 'rgba(255,255,255,0.16)';
const CRUMB = 'rgba(176,174,178,0.5)';

export function ScratchFoilSkia({
  width,
  height,
  seed = 0,
  /* Mounted while the tile is sealed, animating only once this turns true.

     It used to mount on tap, which flashed the answer: the static foil unmounted immediately but Skia
     needs a frame or two to measure and paint, and the face underneath was bare in the gap. Painting the
     sealed state from the start means there is no swap at all — the tap just starts the clock. */
  running,
  /** Fires once the rake finishes, for the value pop and the success haptic. */
  onDone
}: {
  width: number;
  height: number;
  seed?: number;
  running: boolean;
  onDone?: () => void;
}) {
  const skia = getSkia();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!running) return;
    progress.value = 0;
    progress.value = withTiming(
      1,
      // Linear: the easing that matters is *inside* each swipe (see pointAt), not across the rake.
      { duration: SCRATCH_MS, easing: Easing.linear },
      finished => {
        'worklet';
        if (finished && onDone) runOnJS(onDone)();
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, progress]);

  /* Rebuilt each frame on the UI thread. Cheap: a few hundred path ops, no allocation of RN views. */
  const rakePath = useDerivedValue(() => {
    const p = skia!.Skia.Path.Make();
    const t = progress.value;
    const n = SWIPE_COUNT; // a number, not the array — see swipeTable on why the array can't cross

    for (let s = 0; s < n; s++) {
      const from = s / n;
      const to = (s + 1) / n;
      if (t <= from) break;
      const end = Math.min(1, (t - from) / (to - from));

      // The swipe itself, sampled as a polyline.
      const steps = 14;
      for (let i = 0; i <= steps; i++) {
        const q = pointAt(from + (to - from) * ((end * i) / steps), width, height);
        if (i === 0) p.moveTo(q.x, q.y);
        else p.lineTo(q.x, q.y);
      }

      /* Torn edges by construction, not by masking: blobs ride along the swipe slightly off its line,
         so the cleared area has a bitten boundary. The design is explicit that nothing here is a
         rounded rect — and because the swipes overshoot the sides but stop short of the corners, foil
         survives in the corners on its own. */
      for (let k = 0; k < 7; k++) {
        const at = rnd(s * 11 + k) * end;
        const q = pointAt(from + (to - from) * at, width, height);
        const r = height * (0.02 + rnd(s * 23 + k) * 0.07);
        p.addCircle(q.x, q.y + (rnd(s * 31 + k) - 0.5) * height * 0.26, r);
      }
    }
    return p;
  }, [progress, width, height]);

  /** Stroke width per swipe varies a little, so the passes don't look stamped. */
  const rakeWidth = height * 0.19;

  /* After GIVE_UP_AT the remaining foil lets go all at once. Rendered as a full-tile clear whose alpha
     ramps in — the dust stays, so the tile still reads as scratched, but the value is never left
     half-covered. */
  const giveUpOpacity = useDerivedValue(() => {
    const t = progress.value;
    if (t < GIVE_UP_AT) return 0;
    const e = (t - GIVE_UP_AT) / (1 - GIVE_UP_AT);
    return 1 - Math.pow(1 - Math.min(1, e), 2);
  }, [progress]);

  /* Hoisted above the early return with the other hooks. Inline in the JSX it sat *after* it, so a
     binary without Skia would call one fewer hook than one with it — the classic conditional-hook bug,
     and one TypeScript can't see. */
  const dustOpacity = useDerivedValue(() => (progress.value > 0.25 ? 1 : 0), [progress]);

  if (!skia) return null;
  const { Canvas, Group, Rect, Path, Line, Circle, vec } = skia;

  const specks = Math.min(90, Math.round((width * height) / 180));

  return (
    <Canvas style={{ position: 'absolute', left: 0, top: 0, width, height }}>
      <Group layer>
        {/* The foil, exactly as the static tile paints it. */}
        <Rect x={0} y={0} width={width} height={height} color={FOIL} />
        <Line p1={vec(-10, height + 6)} p2={vec(width * 0.46, -8)} color={STREAK} style="stroke" strokeWidth={width * 0.14} />
        <Line p1={vec(width * 0.58, height + 8)} p2={vec(width * 1.02, -6)} color={STREAK} style="stroke" strokeWidth={width * 0.14} />
        {Array.from({ length: specks }, (_, i) => (
          <Rect key={i} x={rnd(i + seed) * width} y={rnd(i + seed + 40) * height} width={1.5} height={1.5} color={SPECK} />
        ))}

        {/* The rake. blendMode="clear" inside the layer is the destination-out equivalent. */}
        <Path path={rakePath} color="black" style="stroke" strokeWidth={rakeWidth} strokeCap="round" strokeJoin="round" blendMode="clear" />
        <Path path={rakePath} color="black" style="fill" blendMode="clear" />

        {/* …and the moment it gives up the rest.

            dstOut inside an opacity Group, NOT clear. `clear` ignores the source alpha entirely — it
            zeroes the destination whatever you fade it to — so this rect wiped the whole tile on the
            very first frame at opacity 0, and the rake was never visible. `dstOut` erases in proportion
            to source alpha (dst × (1 − srcA)), so the Group's opacity actually controls how much foil
            lets go. */}
        <Group opacity={giveUpOpacity}>
          <Rect x={0} y={0} width={width} height={height} color="black" blendMode="dstOut" />
        </Group>
      </Group>

      {/* Dust rides on top of the cleared tile and never fades — the receipt for the coin. Outside the
          layer so the clear passes above can't erase it. */}
      <Group opacity={dustOpacity}>
        {Array.from({ length: 14 }, (_, i) => {
          const q = pointAt(rnd(i + 31), width, height);
          return (
            <Circle
              key={i}
              cx={q.x + (rnd(i + 61) - 0.5) * width * 0.12}
              cy={Math.min(height - 2, Math.max(2, q.y + (rnd(i + 71) - 0.5) * height * 0.16))}
              r={width * (0.008 + rnd(i + 53) * 0.015)}
              color={CRUMB}
            />
          );
        })}
      </Group>
    </Canvas>
  );
}
