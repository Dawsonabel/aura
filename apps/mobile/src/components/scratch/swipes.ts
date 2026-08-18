/* The rake path, ported verbatim from 16A's canvas implementation.

   Five broad diagonal passes across the whole tile, alternating direction and stepping down the face —
   the design's note is "the way a hand actually works a lottery ticket". Kept in its own module because
   both the eraser and the coin sprite have to agree on where the coin is at time t; two copies of this
   maths would drift and the coin would stop touching what it's clearing.

   Every constant below is the design's. Changing one changes the feel, so change it there first. */

/** Total rake time. The design's number. */
export const SCRATCH_MS = 820;

/* Past this fraction the tile gives up the rest of the foil at once, rather than making someone chase
   leftover corners for a clue they already paid for. */
export const GIVE_UP_AT = 0.62;

/* How many passes the rake makes. A plain number, because numbers cross into a worklet safely and the
   array below does not — see the note on swipeTable. */
export const SWIPE_COUNT = 5;

export type Swipe = { x0: number; y0: number; x1: number; y1: number };

/* Built inside the function rather than held in a module-level const.

   Reanimated worklets run on the UI thread with only what the Babel plugin captured into them, and a
   module-scope array imported from another file does NOT reliably make that trip: `SWIPES[seg]` came
   back `undefined` on the UI thread, so pointAt threw "Cannot read property 'x0' of undefined" on the
   first frame. The animation then sat frozen at t=0 — foil painted, coin parked at its start, no rake —
   which looks exactly like an animation that never started rather than one that crashed.

   Five object literals per call is nothing next to being correct on both threads. */
export function swipeTable(): Swipe[] {
  'worklet';
  return [
    { x0: -0.1, y0: 0.16, x1: 1.1, y1: 0.36 },
    { x0: 1.1, y0: 0.52, x1: -0.1, y1: 0.3 },
    { x0: -0.1, y0: 0.6, x1: 1.1, y1: 0.8 },
    { x0: 1.1, y0: 0.92, x1: -0.1, y1: 0.7 },
    { x0: -0.1, y0: 0.44, x1: 1.1, y1: 0.6 }
  ];
}

/* The design's deterministic pseudorandom. Same formula as the foil painter, so the chatter, the torn
   blobs and the settled dust all land in the same places every run — a scratch is a receipt for a coin,
   and it shouldn't look different each time the screen re-renders. */
export function rnd(i: number): number {
  'worklet';
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/* Where the coin is at progress t (0..1) across the whole five-swipe rake.

   Inside each swipe: ease-out (fast bite, slow release), a slight bow so the pass isn't a ruler line,
   and a little chatter so the coin catches instead of gliding. */
export function pointAt(t: number, w: number, h: number): { x: number; y: number; seg: number } {
  'worklet';
  const swipes = swipeTable();
  const n = swipes.length;
  const seg = Math.min(n - 1, Math.max(0, Math.floor(t * n)));
  const local = t * n - seg;
  const s = swipes[seg];
  const e = 1 - Math.pow(1 - local, 2.2);
  const bow = Math.sin(e * Math.PI) * h * 0.05 * (seg % 2 ? -1 : 1);
  const chatter = (rnd(seg * 19 + Math.floor(e * 9)) - 0.5) * h * 0.035;
  return {
    x: w * (s.x0 + (s.x1 - s.x0) * e),
    y: h * (s.y0 + (s.y1 - s.y0) * e) + bow + chatter,
    seg
  };
}
