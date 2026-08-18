/* Is Skia's native side actually present in this binary?

   Skia is a native module. It ships in a dev/TestFlight build but NOT in Expo Go, and — more subtly —
   not in a dev client that was built *before* the dependency was added. A bare top-level import of it
   therefore takes the whole app down on launch, not just the screen that uses it.

   So every Skia import in this app goes through here: the require is attempted once, inside a try, and
   the module is probed by actually constructing something. A require alone isn't proof — React Native's
   module registry resolves the JS happily and only throws when the native side is first touched, which
   would move the crash from launch to first scratch. Making a Path is the cheapest real touch. */

export type SkiaModule = typeof import('@shopify/react-native-skia');

function probe(): SkiaModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@shopify/react-native-skia') as SkiaModule;
    // Touch the native side. Throws in Expo Go and in any build without Skia compiled in.
    mod.Skia.Path.Make();
    return mod;
  } catch (e) {
    /* Logged, not swallowed. Falling back silently is right for the user — the clue still opens — but
       it's wrong for us: "no animation" and "Skia threw for some unrelated reason" look identical from
       the outside, and I spent a round of debugging unable to tell which had happened. */
    console.warn('[scratch] Skia unavailable, falling back to instant reveal:', e);
    return null;
  }
}

let cached: SkiaModule | null | undefined;

/** The Skia module, or null when this binary can't run it. Probed once and remembered. */
export function getSkia(): SkiaModule | null {
  if (cached === undefined) cached = probe();
  return cached;
}

export const hasSkia = (): boolean => getSkia() !== null;
