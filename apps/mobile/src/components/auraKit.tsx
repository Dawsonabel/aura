import { useEffect, type ReactNode } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue
} from 'react-native-reanimated';
import type { Aura } from '@aura/api-client';
import { AuraIcon } from './AuraIcon';
import { ToyShadow } from './ToyShadow';
import { gradeShort } from './profileKit';

/* The Aura tab's own furniture — the segment bar, the gender filter, the card face, the pager and
   the paper receipt. It lives beside voteKit/profileKit rather than inside inbox.tsx because three
   of these (the card face, the receipt, the deck dots) are also rendered by the flip and deck
   screens, and a card that drifts between the grid and the reveal is the one inconsistency this
   design can't survive: they are meant to read as the same physical object.

   Colours that already exist as Tailwind tokens are used as classes; the handful the design
   introduces (the segment track, the filter hairline, the deck's darker ground) are consts here
   rather than new tokens, because nothing outside this tab uses them. */

/* Voter-gender accents. The blue has no token — nothing else in the app colours by gender.

   Non-binary was #7C5CFF, which is now PROTECTED_GLOW to the pixel. That collision matters more than
   it looks: a protected card is lavender *because* it's protected, so a non-binary sender would have
   arrived pre-lavender and the one signal that's meant to be earned by opening a card would have been
   sitting there from the start on a whole cohort of them. Mint keeps the four states — girl, boy,
   non-binary, protected — legible as four. */
export const GENDER_ACCENT: Record<string, string> = {
  girl: '#FF5CA8',
  boy: '#4DA8FF',
  nonbinary: '#6BF2C2'
};
/** A voter whose gender is withheld (their own choice, or the cohort floor). */
export const UNKNOWN_ACCENT = '#8B888D';

/* The ground that pairs with each accent — the same hue pulled down into `ground` so white type still
   holds on it, leaving the bright value for the rim. Used by the Activity feed's own-aura rows, where
   the card is coloured by whoever sent the vote.

   Kept as a table rather than mixed from GENDER_ACCENT at runtime. A programmatic mix at one fixed
   percentage doesn't land evenly across these four: mint and blue are far brighter than the pink at
   the same ratio, so the row that should read quietest ends up loudest. These are picked per hue to
   sit at the same *apparent* depth, which is the thing that actually has to match. */
export const GENDER_GROUND: Record<string, string> = {
  girl: '#4A2A3A',
  boy: '#2A384A',
  nonbinary: '#2F453F'
};
/** Pairs with UNKNOWN_ACCENT — a grey that still reads as tinted rather than as the default row. */
export const UNKNOWN_GROUND = '#353235';

export const TRACK = '#2C2A2D'; // segment / filter / pager track, one step below `ground`
export const HAIRLINE = '#3A373A'; // inactive filter border
export const DEEP = '#1A181B'; // flip + deck ground: darker than the tab, so the card is the light
export const CREAM_INK_MUTED = '#A79B86'; // captions on cream
/* The grade line on a cream card. Darkened from #6F6552, which sat around 5:1 against the cream and
   read as washed out at the 12px this is set in — small bold type needs more separation than the
   ratio alone suggests. This is ~7.5:1 and still clearly below the near-black the name uses, so the
   two don't compete. */
export const CREAM_GRADE = '#57503F';
export const CREAM_RULE = '#D9C7AF';

/* The protected card's palette — a sender with Infinite Aura, whose name no flip will ever buy.

   Shared between the grid card here and the full-size card in flip.tsx, and that sharing is the whole
   point: the grid card is what you tap and the flip card is what you get, so the two have to be
   recognisably the same object. Split across two files with two sets of hex codes, they'd drift the
   first time either was nudged.

   Three values, not one. The mark is a solid shape and the type is strokes, so the shape carries more
   saturation before it starts to glare while text has to stay light enough to read; the glow is
   deepest of all because it's diffused to almost nothing by the time it's visible. */
export const PROTECTED_MARK = '#B5A3FF'; // the filled aura star
export const PROTECTED_INK = '#C9BBFF'; // gender word, and the message on the big card
export const PROTECTED_GLOW = '#7C5CFF'; // the backlight behind the full-size card

/* The receipt's monospace. DM Mono (the design's choice) isn't loaded — adding a fourth Google font
   family for six lines of a receipt costs more startup than it returns, and the platform mono is
   what a real printed receipt looks like anyway. */
export const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

export function accentFor(aura: Aura): string {
  return GENDER_ACCENT[aura.gender] ?? UNKNOWN_ACCENT;
}

/* The glow's colour, which is not always the card's edge colour. A withheld gender edges the card in
   grey — correct, it's an absence — but a grey glow is just a dimmer card, and the roaming light is
   supposed to be the thing pulling you across the grid. Those fall back to the app's pink. */
export function glowFor(aura: Aura): string {
  return GENDER_ACCENT[aura.gender] ?? GENDER_ACCENT.girl;
}

/** "Maya Patel" -> "Maya P." — a flipped card shows a person, never a full legal name. */
export function shortName(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/);
  if (parts.length < 2) return parts[0] || 'Someone';
  return `${parts[0]} ${parts[1].charAt(0).toUpperCase()}.`;
}

/* "Girl" / "Boy" / "Non-binary", and "Someone" for the two cases where the app doesn't get to say:
   the voter chose "Rather not say", or their cohort is too small to hide in (detailHidden). Those
   two are deliberately indistinguishable on the card — telling them apart would itself be a signal. */
export function genderWord(aura: Aura): string {
  if (aura.gender === 'girl') return 'Girl';
  if (aura.gender === 'boy') return 'Boy';
  if (aura.gender === 'nonbinary') return 'Non-binary';
  return 'Someone';
}

// ─────────────────────────────────────────────────────────────
// Segment bar + header pill
// ─────────────────────────────────────────────────────────────

export type Segment = 'activity' | 'cards' | 'receipt';
/* Activity leads, Cards sits in the middle, Receipt last — left to right in the order the tab's own
   story runs: what happened, the cards it left you, the thing you post about them.

   Activity is also what the tab opens on (see the `seg` param in inbox.tsx), so leading the bar and
   being the landing screen agree again — a bar whose first pill is not the one selected on arrival
   reads as though you've already navigated somewhere. */
export const SEGMENTS: { key: Segment; label: string }[] = [
  { key: 'activity', label: 'Activity' },
  { key: 'cards', label: 'Cards' },
  { key: 'receipt', label: 'Receipt' }
];

export function SegmentBar({ value, onChange }: { value: Segment; onChange: (s: Segment) => void }) {
  return (
    /* Bigger since the header came off. With nothing above it this is the top of the screen and the
       only thing naming what you're looking at, so it carries that weight rather than sitting there at
       the size of a sub-control. */
    <View className="flex-row gap-[6px] rounded-pill p-[5px]" style={{ backgroundColor: TRACK }}>
      {SEGMENTS.map(s => {
        const active = s.key === value;
        return (
          <Pressable
            key={s.key}
            onPress={() => onChange(s.key)}
            className="flex-1 items-center rounded-pill"
            style={{ paddingVertical: 12, backgroundColor: active ? '#4A474B' : 'transparent' }}
          >
            <Text className="font-nunito-900 text-[16.5px]" style={{ color: active ? '#FFFFFF' : '#848286' }}>
              {s.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* A generic pill toggle row — the receipt's period switch.

   Level with the segment bar now rather than a step smaller. It used to sit directly under the
   segments, where being visibly the junior control was what kept the two from competing; it now sits
   between the receipt and Share, with nothing near it, and at the old size it read as a caption on a
   button rather than as the control that decides what the receipt says.

   No top margin of its own — the caller places it, because the gap above it is part of a three-way
   spacing the row can't see.

   `textSize` opts in to a larger label, and the default stays 14 rather than moving. Ranks uses this
   bar as its primary tab row — three short words ("Overall", "My grade", "Trending") — while the
   receipt's options are "Last 24 hrs" / "Last 7 days" / "Last 30 days", which already fill their
   thirds at 14. Raising it for everyone would wrap the receipt to fix the leaderboard. */
export function PeriodBar<T extends string>({
  value,
  options,
  onChange,
  textSize = 14
}: {
  value: T;
  options: { key: T; label: string }[];
  onChange: (v: T) => void;
  textSize?: number;
}) {
  return (
    <View className="flex-row gap-[6px] rounded-pill p-[5px]" style={{ backgroundColor: TRACK }}>
      {options.map(o => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            className="flex-1 items-center rounded-pill"
            style={{ paddingVertical: 12, backgroundColor: active ? '#4A474B' : 'transparent' }}
          >
            <Text
              numberOfLines={1}
              className="font-nunito-900"
              style={{ fontSize: textSize, color: active ? '#FFFFFF' : '#848286' }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* `HeaderPill` lived here — the INFINITE / N NEW badge in the Aura tab's header. The header is gone
   (see AuraShell in inbox.tsx) and nothing else used it. */

// ─────────────────────────────────────────────────────────────
// Gender filter — removed
// ─────────────────────────────────────────────────────────────

/* `GenderKey`, `genderFilterOrder` and `GenderFilterRow` lived here — the ALL/girls/boys/NB chips
   above the card grid, ordered so the group you were most likely to want sat second.

   The grid is one undivided stack of cards now. Slicing it by gender was a way of sorting classmates
   that the tab is better off not offering, and with it gone the row of counts had nothing to filter.
   `GENDER_ACCENT` (above) stays — it's what colours a card's edge by who sent it. */

// ─────────────────────────────────────────────────────────────
// The roaming glow
// ─────────────────────────────────────────────────────────────

/* One glow, handed card to card, out of source order — never two lit at once.

   The design builds this from a keyframe pair per card count, which only works because CSS can hand
   every card the same animation and stagger it with a negative delay. Here it's one clock in the
   grid and a derived style per card: `slot` is the card's rank in the visit order, so its window is
   [slot/n, (slot+1)/n) of a single 10s revolution. Deriving beats per-card timers because the clock
   is the thing that must not drift — two cards lit at once is the one failure mode that reads as a
   bug rather than a flourish. */
const ROAM_SECONDS = 10;

export function useRoamClock(): SharedValue<number> {
  const clock = useSharedValue(0);
  useEffect(() => {
    clock.value = 0;
    clock.value = withRepeat(withTiming(1, { duration: ROAM_SECONDS * 1000, easing: Easing.linear }), -1, false);
  }, [clock]);
  return clock;
}

/** The visit order within the unflipped subset — out of reading order, so it doesn't scan as a sweep. */
export function roamSlots(count: number): number[] {
  if (count === 4) return [0, 2, 1, 3];
  if (count === 3) return [0, 2, 1];
  return Array.from({ length: count }, (_, i) => i);
}

// ─────────────────────────────────────────────────────────────
// Card face
// ─────────────────────────────────────────────────────────────

export type CardRoam = { slot: number; of: number; clock: SharedValue<number> } | null;

/** One shared height for a real card and for the empty slot that stands in for a missing one. */
const CARD_HEIGHT = 176;

/* One card in the grid. Two faces of the same object, and nothing in between:

   unflipped — dark, edged in the voter's gender colour, carrying the poll's emoji and the gender word.

   flipped — cream, the name, their grade, and the superlative they picked you for. It leaves the glow
   rotation: the glow only ever lands on something still unopened. */
export function AuraCardFace({
  aura,
  roam,
  onPress
}: {
  aura: Aura;
  roam: CardRoam;
  onPress: () => void;
}) {
  const accent = accentFor(aura);
  const flipped = !!aura.name;
  /* A protected sender you've already opened — and both halves matter.

     `anonymous` alone would mark the card before you'd earned the knowledge, which is the mistake the
     old PROTECTED badge made: it answered "can this one be flipped?" for free, from the grid, for
     every card at once. `opened` alone is just "you've been here". Together they mean the one thing
     worth showing — you went and looked, and this is what you found. */
  const revealed = aura.anonymous && aura.opened;
  const grade = gradeShort(aura.grade);
  const [first, ...rest] = (aura.name ?? '').split(' ');
  const last = rest.join(' ');

  return (
    <View style={{ flex: 1, position: 'relative' }}>
      {roam && <RoamGlow accent={glowFor(aura)} roam={roam} />}
      <RoamCard roam={roam}>
        <Pressable
          onPress={onPress}
          className="items-center justify-center gap-[8px] px-[10px] py-[14px]"
          style={{
            height: CARD_HEIGHT,
            borderRadius: 18,
            backgroundColor: flipped ? '#FFF6E8' : TRACK,
            borderWidth: 2.5,
            // Lavender edge once you know, matching the mark and the word inside it.
            borderColor: revealed ? PROTECTED_MARK : accent,
            /* No dimming for "opened". It shipped here and was wrong.

               The idea was that a card you'd opened and couldn't turn shouldn't look identical to one
               you'd never touched. But `opened` is set by *looking*, not by failing — so peeking at an
               ordinary card and backing out without spending a flip faded it to 55%, and a card that
               is still perfectly flippable ended up wearing the app's disabled treatment. That reads
               as "this one is spent, don't bother", which is the opposite of true and discourages
               exactly the tap the screen wants.

               Opacity was the wrong signal for the job in any case: in this app it means *unavailable*
               (see the spent Flip button), and "you've seen this" is not unavailability. The two cases
               that genuinely can't be turned are covered without it — a protected sender goes lavender
               (`revealed`, above), and being out of flips is a whole-screen fact the header already
               states with a countdown, not a per-card one.

               `aura.opened` is still doing its job; it's half of `revealed`. */
          }}
        >
          {flipped ? (
            /* Whole name, stacked. It was the first name only, over a coloured disc with their initial
               in it — a stand-in avatar for a person who has no picture in this app. The name is the
               thing the flip bought, so it gets both lines and the space the disc was using. */
            <View className="items-center">
              <Text
                className="font-fredoka-700 text-center text-[20px] leading-[23px]"
                numberOfLines={1}
                style={{ color: '#2D2A2E' }}
              >
                {first}
              </Text>
              {!!last && (
                <Text
                  className="font-fredoka-700 text-center text-[20px] leading-[23px]"
                  numberOfLines={1}
                  style={{ color: '#2D2A2E' }}
                >
                  {last}
                </Text>
              )}
            </View>
          ) : (
            <View
              className="items-center justify-center"
              style={{ width: 46, height: 46, borderRadius: 99, backgroundColor: '#403E41' }}
            >
              {/* The aura mark instead of the poll's emoji, once you've opened it and found out.

                  Deliberately only *after* opening. Before that the card has to look like every other
                  face-down card, or the grid gives away for free the one thing you have to spend a tap
                  to learn — that's why the old PROTECTED badge came off. `revealed` below is what
                  keeps that honest: no `aura.opened`, no lavender. */}
              {revealed ? (
                <AuraIcon name="aura" size={24} color={PROTECTED_MARK} filled />
              ) : (
                <Text style={{ fontSize: 20 }}>{aura.emoji}</Text>
              )}
            </View>
          )}

          {/* The poll they picked you on, as its emoji. On a face-down card it sits up top in a disc,
              which is all you get; on a flipped one it drops below the name — the same mark, saying
              which question this was, without the sentence. The wording itself is on the reveal. */}
          {flipped ? (
            <Text style={{ fontSize: 26 }}>{aura.emoji}</Text>
          ) : (
            <Text
              className="font-fredoka-700 text-center"
              numberOfLines={1}
              style={{
                fontSize: aura.gender === 'nonbinary' ? 17 : 21,
                lineHeight: 23,
                // Lavender once you know it's protected — matching the full-size card exactly, so the
                // card you tap and the card you get are visibly the same object.
                color: revealed ? PROTECTED_INK : accent
              }}
            >
              {genderWord(aura)}
            </Text>
          )}

          {grade && (
            <Text
              className="font-nunito-900 text-[15px]"
              style={{ color: flipped ? CREAM_GRADE : '#8B888D', letterSpacing: 0.6 }}
            >
              {grade.toUpperCase()}
            </Text>
          )}

          {/* The PROTECTED shield lived here and is gone, along with the superlative that used to
              print on a flipped card.

              It marked out the one card in the grid that would never turn — but marking it is the
              problem. Every other face-down card looks identical whatever is behind it, and a badge
              that says "don't bother with this one" both singles the sender out and answers, for
              free, a question the grid isn't supposed to answer. Whether a card can be flipped is
              something you find out by opening it, like everything else. */}
        </Pressable>
      </RoamCard>
    </View>
  );
}

/* An empty slot, so a short page is still a page.

   The last page rarely divides by four, and the grid used to just end — two cards and then nothing,
   which pulled the pager up under them and made the whole bottom of the screen jump between pages.
   These hold the missing places open: same 176pt box, same radius, dashed and unfilled so they read
   as "nothing here" rather than as a card that failed to load.

   Not pressable, and invisible to a screen reader — there is nothing to announce about a gap. */
export function EmptyCardSlot() {
  return (
    <View style={{ flex: 1 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View
        style={{
          height: CARD_HEIGHT,
          borderRadius: 18,
          borderWidth: 2,
          borderColor: HAIRLINE,
          borderStyle: 'dashed'
        }}
      />
    </View>
  );
}

/* The halo. RN has no `filter: blur()`, so the design's blurred slab is a 9px ring of the accent
   showing around the (opaque) card, softened by an iOS shadow. It fades and scales rather than
   simply appearing, which is what keeps it reading as light instead of a second border.

   Exported because the welcome screen's four tiles run the same roaming light. `radius` is a prop for
   that: the ring sits 9px outside whatever it wraps, so it has to track the wrapped shape's corner or
   the halo pinches at the corners. Default 24 is the aura card's 18 plus the offset those two were
   tuned at — pass card-radius + 6 for anything else. */
export function RoamGlow({
  accent,
  roam,
  radius = 24
}: {
  accent: string;
  roam: NonNullable<CardRoam>;
  radius?: number;
}) {
  const { slot, of, clock } = roam;
  const style = useAnimatedStyle(() => {
    const w = 1 / of;
    const local = (((clock.value - slot * w) % 1) + 1) % 1;
    return {
      opacity: interpolate(local, [0, 0.12 * w, 0.88 * w, w, 1], [0, 0.5, 0.5, 0, 0], 'clamp'),
      transform: [{ scale: interpolate(local, [0, 0.12 * w, 0.88 * w, w, 1], [0.94, 1.02, 1.02, 0.94, 0.94], 'clamp') }]
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          top: -9,
          left: -9,
          right: -9,
          bottom: -9,
          borderRadius: radius,
          backgroundColor: accent,
          shadowColor: accent,
          shadowOpacity: 0.9,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 0 }
        },
        style
      ]}
    />
  );
}

/** The matching 3.5% swell on the card itself, so the lit card lifts rather than just glowing. */
function RoamCard({ roam, children }: { roam: CardRoam; children: ReactNode }) {
  const slot = roam?.slot ?? 0;
  const of = roam?.of ?? 1;
  const fallback = useSharedValue(0);
  const clock = roam?.clock ?? fallback;
  const style = useAnimatedStyle(() => {
    if (!roam) return { transform: [{ scale: 1 }] };
    const w = 1 / of;
    const local = (((clock.value - slot * w) % 1) + 1) % 1;
    return {
      transform: [
        { scale: interpolate(local, [0, 0.16 * w, 0.84 * w, w, 1], [1, 1.035, 1.035, 1, 1], 'clamp') }
      ]
    };
  });
  return <Animated.View style={style}>{children}</Animated.View>;
}

// ─────────────────────────────────────────────────────────────
// Pager
// ─────────────────────────────────────────────────────────────

/* Two square toy buttons, centred. No range, no progress bar.

   Both of those were answering a question the grid answers better by changing — four cards you have
   not seen is the feedback, and a three-page list needs no position readout. What is left is the two
   things you can do.

   Sized rather than stretched, and each one sits under the centre of the card column it pages. The row
   mirrors the grid exactly — two `flex: 1` halves with the same 12pt gap — so the back button lands
   under the left cards and the next button under the right ones, and the pair reads as belonging to
   the grid rather than floating beneath it.

   Note the halves use `style={{ flex: 1 }}` rather than the `flex-1` class: an earlier version put
   that class straight on the buttons' Pressables and they came out visibly lopsided on device. The
   cards above have always sized themselves with the style prop, so this matches what demonstrably
   lays out evenly. The buttons themselves are a fixed square, which is also what lets them read as
   buttons rather than as bars — the difference between this and the segment control up top.

   The toy shadow is the same object the candidate sheet's Close button is (see voteKit) — a flat
   offset slab that depresses on press. Note `onPress` goes on the ToyShadow itself, never on a
   Pressable wrapping it: the depress is driven by ToyShadow's own internal Pressable, so a wrapper
   would leave the button working but permanently un-pressed.

   Spent directions go flat and grey — the slab disappears along with the colour, so a dead end stops
   looking like something that would move if you pushed it. */
/* Wider than tall, but nowhere near the column width — a button, not a bar. Fixed rather than
   stretched to the half, which is what keeps it from turning back into the full-width pair. */
const PAGER_W = 112;
const PAGER_H = 58;

/* The pager floats between the grid and the tab bar, and it should sit the same distance from each.

   Above is this margin. Below is the sum of three things the pager doesn't own: the segment's trailing
   spacer, the scroll view's bottom padding (8) and the tab bar container's top padding (12) — see
   PAGER_TAIL, which is what the Cards segment renders to make the two add up. Split out here so the
   two halves of the gap are defined next to each other rather than 200 lines apart in two files.

   Generous on purpose. These buttons sit directly above the tab bar, and a thumb aiming at "next"
   that lands low switches tabs instead — a wrong tap that throws away where you were. The gap is the
   cheap insurance against that. */
export const PAGER_GAP = 34;
/** What the scroll view and the tab bar contribute below the pager, before PAGER_TAIL. */
const BELOW_PAGER_FIXED = 20;
/** The spacer the Cards segment renders after the pager so the gap below matches the gap above. */
export const PAGER_TAIL = PAGER_GAP - BELOW_PAGER_FIXED;

export function PagerRow({
  atStart,
  atEnd,
  onPrev,
  onNext
}: {
  atStart: boolean;
  atEnd: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <View className="flex-row gap-3" style={{ marginTop: PAGER_GAP }}>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <PagerButton dir="chevronLeft" disabled={atStart} onPress={onPrev} />
      </View>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <PagerButton dir="chevronRight" disabled={atEnd} onPress={onNext} />
      </View>
    </View>
  );
}

function PagerButton({
  dir,
  disabled,
  onPress
}: {
  dir: 'chevronLeft' | 'chevronRight';
  disabled: boolean;
  onPress: () => void;
}) {
  const label = dir === 'chevronLeft' ? 'Previous cards' : 'Next cards';
  return (
    <View accessibilityRole="button" accessibilityState={{ disabled }} accessibilityLabel={label}>
      <ToyShadow
        depth={disabled ? 0 : 4}
        shadowColor={disabled ? TRACK : '#333135'}
        backgroundColor={disabled ? TRACK : '#4A474B'}
        radius={18}
        onPress={onPress}
        disabled={disabled}
      >
        <View className="items-center justify-center" style={{ width: PAGER_W, height: PAGER_H }}>
          <AuraIcon name={dir} size={20} color={disabled ? '#57545A' : '#F2F0F1'} />
        </View>
      </ToyShadow>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Deck dots
// ─────────────────────────────────────────────────────────────

/* `DeckDots` lived here — the swipe position indicator on the flipped-cards deck. The deck screen is
   deleted; a flipped card is just a card in the grid now, and tapping one reopens its reveal. */

// ─────────────────────────────────────────────────────────────
// Receipt paper
// ─────────────────────────────────────────────────────────────

export type ReceiptLine = { key: string; item: string; qty: number; fill: string };

export function DashedRule({ marginTop = 9 }: { marginTop?: number }) {
  return (
    <View
      style={{
        marginTop,
        borderTopWidth: 2,
        borderStyle: 'dashed',
        borderColor: CREAM_RULE
      }}
    />
  );
}

/** The printed bars. Views rather than block glyphs, which don't render on every platform's mono. */
export function Barcode({ tint = CREAM_INK_MUTED }: { tint?: string }) {
  const widths = [3, 2, 1.5, 3, 1.5, 2, 3, 3, 1.5, 2, 3, 1.5, 2, 3, 1.5, 3, 2, 1.5, 3, 2, 3, 1.5, 2, 3, 3];
  return (
    <View className="flex-row items-end justify-center gap-[2px]" style={{ height: 15 }}>
      {widths.map((w, i) => (
        <View key={i} style={{ width: w, height: 15, backgroundColor: tint, opacity: 0.75 }} />
      ))}
    </View>
  );
}

/* The paper itself. Rendered here so the tab and any future share sheet print the same object.
   `compact` is the in-tab size; the roomier form is for a full-screen or exported copy. */
export function ReceiptPaper({
  subtitle,
  lines,
  total,
  split,
  delta,
  closer,
  footnote,
  compact = true
}: {
  subtitle: string;
  lines: ReceiptLine[];
  total: number;
  split: { girls: number; boys: number; nb: number; unknown: number };
  delta: string | null;
  closer: string;
  footnote?: string;
  compact?: boolean;
}) {
  const fs = compact ? 0 : 1; // one-step-up scale for the roomy copy
  return (
    <View className="px-[15px] pb-[11px] pt-[14px]">
      <View className="items-center">
        <Text className="font-fredoka-700" style={{ fontSize: 16 + fs * 4, color: '#2D2A2E', letterSpacing: 1 }}>
          AURA RECEIPT
        </Text>
        <Text
          className="mt-[2px]"
          style={{ fontFamily: MONO, fontSize: 9.5 + fs, color: '#8B888D', letterSpacing: 0.6 }}
        >
          {subtitle}
        </Text>
      </View>

      <DashedRule />

      <View className="mt-[7px] flex-row items-baseline">
        <Text style={{ fontFamily: MONO, fontSize: 8.5 + fs * 0.5, color: CREAM_INK_MUTED, letterSpacing: 0.5, flex: 1 }}>
          ITEM
        </Text>
        <Text
          style={{ fontFamily: MONO, fontSize: 8.5 + fs * 0.5, color: CREAM_INK_MUTED, letterSpacing: 0.5, width: 28, textAlign: 'right' }}
        >
          QTY
        </Text>
      </View>

      <View className="mt-1 gap-[3px]">
        {lines.map(l => (
          <View key={l.key} className="flex-row items-baseline gap-[6px]">
            <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: l.fill, transform: [{ translateY: 1 }] }} />
            <Text className="font-nunito-800" numberOfLines={1} style={{ fontSize: 11 + fs * 0.5, color: '#2D2A2E', maxWidth: '74%' }}>
              {l.item}
            </Text>
            {/* A drawn hairline, not `borderStyle: 'dotted'` — RN only honours a border style when it
                applies to all four sides, so a dotted bottom border comes out invisible here. */}
            <View style={{ flex: 1, minWidth: 8, height: 1.5, backgroundColor: '#CFC3AE', opacity: 0.7, transform: [{ translateY: -3 }] }} />
            <Text style={{ fontFamily: MONO, fontSize: 11 + fs * 0.5, color: '#2D2A2E' }}>×{l.qty}</Text>
          </View>
        ))}
      </View>

      <DashedRule />

      <View className="mt-[7px] flex-row items-baseline">
        <Text className="font-fredoka-700" style={{ fontSize: 14 + fs * 3, color: '#2D2A2E' }}>
          TOTAL
        </Text>
        <View className="flex-1" />
        <Text className="font-fredoka-700" style={{ fontSize: 21 + fs * 9, lineHeight: 24 + fs * 9, color: '#FF5CA8' }}>
          {total}
        </Text>
      </View>

      {/* The withheld picks get their own grey segment. Without it the bar normalises the two known
          genders to a full width, so a receipt where a third of the senders are behind the cohort
          floor draws a 100% bar out of counts that don't reach the total printed above it. */}
      {total > 0 && (
        <View className="mt-[3px] h-[7px] flex-row gap-[3px] overflow-hidden rounded-pill">
          <SplitBar n={split.girls} color={GENDER_ACCENT.girl} />
          <SplitBar n={split.boys} color={GENDER_ACCENT.boy} />
          <SplitBar n={split.nb} color={GENDER_ACCENT.nonbinary} />
          <SplitBar n={split.unknown} color={UNKNOWN_ACCENT} />
        </View>
      )}

      <View className="mt-[5px] flex-row items-baseline">
        <Text style={{ fontFamily: MONO, fontSize: 9.5 + fs, color: '#8B888D' }}>
          GIRLS {split.girls} · BOYS {split.boys} · NB {split.nb}
          {split.unknown > 0 ? ` · ${split.unknown} HIDDEN` : ''}
        </Text>
        <View className="flex-1" />
        {delta && <Text style={{ fontFamily: MONO, fontSize: 9.5 + fs, color: '#8B888D' }}>{delta}</Text>}
      </View>

      <View className="mt-2">
        <Barcode />
      </View>

      <Text
        className="font-fredoka-700 mt-[5px] text-center"
        style={{ fontSize: 13.5 + fs * 2.5, lineHeight: 17 + fs * 3, color: '#2D2A2E' }}
      >
        {closer}
      </Text>

      {footnote && (
        <Text className="mt-[6px] text-center" style={{ fontFamily: MONO, fontSize: 9, color: CREAM_INK_MUTED }}>
          {footnote}
        </Text>
      )}
    </View>
  );
}

function SplitBar({ n, color }: { n: number; color: string }) {
  if (n <= 0) return null;
  return <View style={{ flex: n, backgroundColor: color }} />;
}
