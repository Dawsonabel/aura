import { useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Line, Rect, Circle } from 'react-native-svg';

/* The scratch-off foil, ported from the design's `aura-foil.js`.

   That original is a canvas painter; RN has no canvas, so this redraws the same picture in
   react-native-svg. The pseudorandom generator is copied **exactly** — `sin(i * 12.9898) * 43758.5453`,
   fractional part — so a tile with a given `seed` has its specks and crumbs in the same places as the
   mock. Change the formula and the app stops matching the design for no visible reason.

   Two states, both from the design:
     sealed  — grey foil, two white streaks, specks, and a label ("INITIAL", "SCRATCH IT OFF")
     dust    — revealed, with only the crumbs left behind

   Grey is deliberate and load-bearing: 15A moved the currency to yellow precisely so grey could mean
   "unscratched foil" and nothing else. The card underneath is what the foil wipes off to. */

/* Exported because the *colour* has to be paintable before the picture is. Both textured foils here
   (this SVG one, and the Skia canvas) need a layout pass before they can draw anything, so whoever owns
   a sealed tile lays a flat rect of this down underneath them to cover the frames in between. */
export const FOIL_COLOR = '#B0AEB2';

const FOIL = FOIL_COLOR;
const SPECK = 'rgba(90,88,92,0.30)';
const STREAK = 'rgba(255,255,255,0.16)';
const CRUMB = 'rgba(176,174,178,0.5)';
const LABEL_INK = '#5B585C';

/** Verbatim from aura-foil.js — deterministic per index, so tiles are stable across renders. */
function rnd(i: number): number {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export function AuraFoil({
  /** Pipe-separated lines, as in the design: `label="INITIAL|SCRATCH IT OFF"`. */
  label,
  dust = false,
  seed = 0
}: {
  label?: string;
  dust?: boolean;
  seed?: number;
}) {
  // Measured rather than passed in: the foil fills a grid cell whose width isn't known until layout.
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      onLayout={e => {
        const { width, height } = e.nativeEvent.layout;
        // Only re-measure on a real change; layout fires on every parent re-render.
        setSize(prev => (prev && prev.w === width && prev.h === height ? prev : { w: width, h: height }));
      }}
    >
      {size && size.w > 0 && size.h > 0 ? (
        dust ? (
          <Crumbs w={size.w} h={size.h} seed={seed} />
        ) : (
          <>
            <Sealed w={size.w} h={size.h} seed={seed} />
            {label ? <FoilLabel label={label} w={size.w} /> : null}
          </>
        )
      ) : null}
    </View>
  );
}

/** Revealed tile: the foil is gone, a few crumbs are not. */
function Crumbs({ w, h, seed }: { w: number; h: number; seed: number }) {
  return (
    <Svg width={w} height={h}>
      {Array.from({ length: 14 }, (_, i) => (
        <Circle
          key={i}
          cx={w * (0.1 + rnd(i + seed + 3) * 0.8)}
          cy={h * (0.1 + rnd(i + seed + 31) * 0.8)}
          r={w * (0.008 + rnd(i + seed + 53) * 0.015)}
          fill={CRUMB}
        />
      ))}
    </Svg>
  );
}

function Sealed({ w, h, seed }: { w: number; h: number; seed: number }) {
  /* The design's speck count is (w·h)/180 — about 140 on a 160px tile. Capped, because every speck is
     an SVG node here rather than a canvas fillRect, and two sealed tiles on one screen would otherwise
     mount ~280 of them. At this size the texture reads the same either way. */
  const specks = Math.min(90, Math.round((w * h) / 180));
  return (
    <Svg width={w} height={h}>
      <Rect x={0} y={0} width={w} height={h} fill={FOIL} />
      {/* Two diagonal highlights, as if light were catching the foil. */}
      <Line x1={-10} y1={h + 6} x2={w * 0.46} y2={-8} stroke={STREAK} strokeWidth={w * 0.14} />
      <Line x1={w * 0.58} y1={h + 8} x2={w * 1.02} y2={-6} stroke={STREAK} strokeWidth={w * 0.14} />
      {Array.from({ length: specks }, (_, i) => (
        <Rect key={i} x={rnd(i + seed) * w} y={rnd(i + seed + 40) * h} width={1.5} height={1.5} fill={SPECK} />
      ))}
    </Svg>
  );
}

/* Rendered as RN text rather than SVG text so it picks up Nunito properly — the design's canvas asks
   for `900 Nunito`, and SvgText font resolution on RN is far less reliable than a plain <Text>.

   Exported because the foil underneath isn't always this component: when Skia is available the sealed
   tile is painted by the Skia canvas instead, and that draws no text. The label has to be able to sit
   over either one, so it lives here and is positioned by whoever owns the tile. */
export function FoilLabel({ label, w }: { label: string; w: number }) {
  const lines = label.split('|');
  const fontSize = Math.max(9, Math.min(w * 0.11, 12));
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
      {lines.map((line, i) => (
        <Text
          key={i}
          className="font-nunito-900"
          style={{ fontSize, lineHeight: fontSize + 3, color: LABEL_INK, textAlign: 'center' }}
        >
          {line}
        </Text>
      ))}
    </View>
  );
}
