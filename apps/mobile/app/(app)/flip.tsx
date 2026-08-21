import { useEffect } from 'react';
import { Dimensions, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming
} from 'react-native-reanimated';
import type { Aura } from '@aura/api-client';
import { useAuras } from '../../src/hooks/useAuras';
import { useRevealAuraName } from '../../src/hooks/useRevealAuraName';
import { AuraIcon } from '../../src/components/AuraIcon';
import { ToyShadow } from '../../src/components/ToyShadow';
import { AuthError } from '../../src/components/authKit';
import { InlineFailure, SkeletonBlock } from '../../src/components/stateKit';
import {
  CREAM_GRADE,
  CREAM_INK_MUTED,
  CREAM_RULE,
  DEEP,
  PROTECTED_GLOW,
  PROTECTED_INK,
  PROTECTED_MARK,
  TRACK,
  genderWord,
  glowFor
} from '../../src/components/auraKit';
import { gradeLabel, gradeShort } from '../../src/components/profileKit';
import { DAY_MS, dayKey, relativeTime } from '../../src/lib/auraTab';

/* One card, four states.

   The payoff, the card waiting on the button, the one you've run out of flips for, and the one from a
   sender protected exactly the way you are. They are all the same moment from the user's side — a card
   you tapped, at full size — and the two that can't be turned are not failures worth a screen of their
   own. Splitting them let the object drift into three different cards; it's one now, and the states
   differ only in whether the button is live and what the line above it says.

   Nothing is ever spent on the two locked cases. The server doesn't charge either (revealAuraName
   throws on an anonymous sender before it touches the counter), so there was never a refund to explain
   — which is why the "NOTHING SPENT" badge that used to say so is gone along with the panel it sat on. */

/* The card, sized to the phone rather than to a number.

   It went 236×320 → 296×401 chasing "make it bigger", overshot down to 200×271 making room for the
   line above and the two buttons below, then 250×339, then this — and the reason it kept missing is
   that a fixed height can only be right on one screen. What's left over after the caption and the two
   buttons is a fraction of the window, not a constant, so the card is a fraction too.

   0.51 of the window is the largest share that still clears the footer on a 667pt SE, where the
   safe-area insets are ~50pt smaller and the same slack doesn't exist. Capped at 434 so it stops
   growing on tall phones before it runs into the 21px side padding (at this ratio 434 tall is 320
   wide, and the widest a 393pt screen can hold is 351).

   The ratio is held exactly at every size — the flip animation positions both faces absolutely against
   this one frame (see FlipCard), so width and height are not independently adjustable without the two
   faces drifting apart mid-rotation. Derive one from the other, never both by hand. */
/* When the vote happened, to the minute — for the first week.

   `relativeTime` is right for the Activity feed, where a scrolling list of many votes wants a coarse
   label. This card is one vote you spent a flip to open, and "Tuesday" is vaguer than the data: `ts`
   is a TIMESTAMPTZ, so the exact minute has been there the whole time and only the formatter was
   dropping it.

   Inside a week: the day you'd actually say out loud, then the clock. "Today" rather than "3 h ago" —
   pairing a relative age with an absolute time ("3 h ago, 3:42 PM") says one thing twice, and the
   clock is the half that was asked for.

   Past a week it falls back to `relativeTime`'s "5 Aug", unchanged and deliberately so — that's the
   case still to be designed, and guessing at it now would just be another thing to undo.

   Calendar days, not 24-hour chunks, via the same `dayKey` the feed uses: a vote at 11pm last night
   is "Yesterday", not "10 h ago". Rendered in the reader's own locale and zone, which is the voter's
   too — one school, one clock.

   Scoped to this file rather than added to auraTab: the feed's wording is right for the feed. */
function voteStamp(ts: string, now = Date.now()): string {
  const then = new Date(ts);
  if (now - then.getTime() >= 7 * DAY_MS) return relativeTime(ts, now);

  const clock = then.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const key = dayKey(ts);
  const day =
    key === dayKey(new Date(now).toISOString())
      ? 'Today'
      : key === dayKey(new Date(now - DAY_MS).toISOString())
        ? 'Yesterday'
        : then.toLocaleDateString(undefined, { weekday: 'long' });
  return `${day}, ${clock}`;
}

const CARD_RATIO = 0.7375;
const CARD_H = Math.round(Math.min(434, Dimensions.get('window').height * 0.51));
const CARD_W = Math.round(CARD_H * CARD_RATIO);
const LIFT = 9; // the cream card's toy-shadow slab, drawn by hand — see FlipCard

export default function Flip() {
  const { id = '', spent } = useLocalSearchParams<{ id?: string; spent?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, isLoading, isError, refetch } = useAuras();

  const aura = data?.auras.find(f => f.id === id) ?? null;
  const flipsLeft = data?.flipsLeft ?? 0;

  /* `spent` is the caller saying it never even attempted a flip — the out-of-flips path, which is now
     the only way to reach this screen with nothing to turn over and nothing to turn it with. */
  const outOfFlips = spent === '1';
  /* Whether this card can still be turned over here.

     The screen no longer arrives post-flip — the Cards grid sends you here face down and the button
     below spends the flip — so an unnamed card is the normal case rather than a failure. This decides
     whether the button is live, not which screen to draw; there is only one screen now. The server
     checks the allowance again on the mutation regardless.

     `aura.anonymous` is folded in at the call site rather than here: it's a different kind of no
     (permanent, and not about your allowance) and it needs its own line above the card. */
  const canFlip = !outOfFlips && !!data?.infiniteAura && flipsLeft > 0;
  /* `awaitingName` lived here — it held a skeleton while a flip charged before navigation and the name
     hadn't landed in the cache yet. Nothing charges before navigating any more, and keeping it would
     swap the card for a skeleton at exactly the moment it is supposed to be turning over. Only the
     first load blocks now. */

  return (
    <View className="flex-1 px-[21px]" style={{ backgroundColor: DEEP, paddingTop: insets.top + 14 }}>
      {/* No header at all.

          Two things used to live up here and both are gone. "N flips left today" counted the remainder
          on the screen that exists to enjoy spending one, which turned a reveal into a receipt — the
          Cards grid already shows the allowance as stars, and that's where someone deciding whether to
          spend another is actually looking.

          The close button went with it: it did exactly what "Back to the cards" does, one thumb-reach
          further away, and two controls for one destination is a choice the reader has to make for no
          reason. The card gets the room they were both using. */}

      {isError ? (
        <View className="mt-6">
          <InlineFailure
            icon="aura"
            title="That card didn't load"
            body="Nothing was spent. It just didn't come back."
            onRetry={() => refetch()}
          />
        </View>
      ) : isLoading ? (
        <View className="mt-[52px] items-center">
          <SkeletonBlock height={CARD_H} width={CARD_W} radius={26} />
        </View>
      ) : !aura ? (
        <View className="mt-6">
          <InlineFailure
            icon="aura"
            title="This one's gone"
            body="Aura fades after 30 days, and blocking someone hides theirs."
            onRetry={() => router.back()}
          />
        </View>
      ) : (
        /* Every state of this screen, one component.

           A card with a name is a reopened reveal. One without is a card waiting on the button. One
           without an allowance is the same card with the button spent. One from a protected sender is
           the same card again, spent permanently. All four used to be two components and a `Blank`
           that replaced the card with a panel of prose — which meant the two cases you can do nothing
           about were also the two where the person you tapped vanished from the screen.

           That was backwards. Everything on a face-down card — emoji, gender, grade, how many times
           they voted for you — is free regardless of flips or membership. Only the *name* was ever
           behind the flip, so only the name should be missing.

           So the card never changes. Two props carry the difference: whether the button is live, and
           one line above the card saying why not. */
        <Reveal aura={aura} canFlip={canFlip} onBack={() => router.back()} />
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// The name
// ─────────────────────────────────────────────────────────────

/* The card, before and after.

   One component for both states rather than two, because the whole point is that the card doesn't go
   anywhere — it sits face down, you tap Flip, and the same card turns over. Splitting this in two
   would remount FlipCard at exactly the moment it needs to animate, and the turn would be replaced by
   a cut. Only the button underneath changes. */
function Reveal({ aura, canFlip, onBack }: { aura: Aura; canFlip: boolean; onBack: () => void }) {
  const accent = glowFor(aura);
  const revealName = useRevealAuraName();
  const flipped = !!aura.name;
  /* Three ways the button is dead, one way it's alive: already turned, no allowance left, or a sender
     who can't be named at any price. All three share the disabled treatment, because a dead button is
     a dead button — what differs is where the explanation lives.

     `aura.anonymous` is folded in here rather than by the caller: it's the card that explains itself
     (see FlipCard's last line), so the caller has nothing to pass. */
  const spent = flipped || aura.anonymous || !canFlip;

  /* The breath the card's halo used to have.

     Same 1400ms in-out as the old glow, on the one control that wants attention. A button growing a
     few percent reads as alive without ever leaving its own footprint, which is why it works here and
     the hard-edged halo didn't.

     It stops dead once the button is spent — turned already, or no allowance left. The button stays
     on screen either way (see below) but it has nothing left to invite, and a dead control that keeps
     pulsing reads as still-pressable: the animation is the invitation, so it goes when the invitation
     does. */
  const breathe = useSharedValue(0);
  useEffect(() => {
    breathe.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [breathe]);
  const breathing = useAnimatedStyle(() => ({
    transform: [{ scale: spent ? 1 : interpolate(breathe.value, [0, 1], [1, 1.035]) }]
  }));

  return (
    <>
      <View className="mt-[20px] items-center">
        {/* Above the card, not under it.

            It's the condition you're deciding under, so it belongs before the thing you're deciding
            about — underneath it read as a caption on the card, which is the one thing it isn't.

            This line is about *your* situation, not the sender's — what you have left to spend. So a
            protected card keeps the ordinary reassurance and lets the card itself explain why it
            won't turn, while running out of flips says so here, because that one is genuinely about
            you and resets tonight.

            The out-of-flips line replaces the reassurance rather than joining it: promising that
            nobody will know you looked is beside the point on a card you can't look at. */}
        <Text className="font-nunito-800 mb-[20px] text-center text-[16px] leading-[21px] text-ink-muted">
          {canFlip || flipped || aura.anonymous
            ? "They'll never know you saw their vote... 👀"
            : 'Out of flips for today :('}
        </Text>

        <FlipCard aura={aura} accent={accent} />
      </View>

      {/* Two buttons, always both, and the turn changes which of them is live rather than how many
          there are. Nothing in this footer moves when the card flips.

          The error is surfaced rather than swallowed: a refused flip (the server's own allowance check
          is the real gate) has to say so, or the button just appears not to work. */}
      <View className="flex-1" />
      <View className="mb-7 gap-[10px]">
        {revealName.isError && (
          <View className="mb-3">
            <AuthError message={(revealName.error as Error).message} />
          </View>
        )}
        {/* Pink spends, mint leaves.

            Leaving without flipping used to mean finding the tab bar, which is the only other way off
            this screen and isn't an answer to the question it's asking — so the way out sits under the
            way forward, where a decision has both halves in one place.

            The colours carry which is which: pink is the app's primary-action colour and this is the
            only thing on the screen that spends anything, so it takes it. Mint reads as the quiet
            option, which is what going back is. */}
        {/* Stays after the turn, spent rather than removed.

            Pulling it off screen let the whole footer jump up the instant the name landed — at exactly
            the moment the card is doing the one animation this screen exists for, which is the worst
            possible time to move everything underneath it. Leaving it in place as a dead control costs
            nothing and keeps "Back to the cards" under the same thumb it was under a second ago.

            It also answers the question the empty space used to raise: the flip is done, not pending. */}
        <Animated.View className="mb-[14px] items-center" style={breathing}>
            {/* Narrower than the row, unlike every other CTA in the app.

                Width is now the only thing separating these two — both are squared off, so the pair
                reads as one stack of cards rather than a button and a bar, and the flip screen stops
                mixing two button languages. What still has to come across is that they aren't
                equivalent: one spends a flip and the other walks away.

                Colour and width carry that. Pink is the app's primary-action colour, and pulling it in
                to 58% inverts the usual "primary is widest" rule on purpose — the pink is the one that
                costs you something, so it should read as a deliberate press rather than the obvious
                default, and the wide mint bar stays the plain, thumb-reachable way out. */}
            <View style={{ width: '58%' }}>
            <ToyShadow
              depth={4}
              shadowColor="#C43A7C"
              backgroundColor="#FF5CA8"
              radius={20}
              onPress={() => revealName.mutate(aura.id)}
              disabled={spent || revealName.isPending}
              /* Two different kinds of "not now", two depths of fade. Mid-flip it's a request in
                 flight and comes back; spent — turned already, or out of flips — is over for now, so
                 it drops further and reads as dead rather than busy. */
              style={spent ? { opacity: 0.3 } : revealName.isPending ? { opacity: 0.6 } : undefined}
            >
              {/* Fixed height, not vertical padding.

                  Padding makes the button's size a function of its font size, so every bump to the
                  label grew the button too — which is the opposite of what's wanted here. Pinning the
                  height decouples the two: the type can go up or down and the footer stays put. */}
              <View className="items-center justify-center" style={{ height: 58 }}>
                <Text className="font-fredoka-700 text-[28px] text-white">
                  {revealName.isPending ? 'Flipping…' : 'Flip it'}
                </Text>
              </View>
            </ToyShadow>
            </View>
          </Animated.View>
        {/* Pulled in off the edges too, so the footer is a stack of two cards rather than one card
            sitting on a bar. Still much wider than the pink — width is what says which of these is
            the ordinary way out. */}
        <View className="items-center">
          <View style={{ width: '82%' }}>
            <ToyShadow depth={4} shadowColor="#3FBF95" backgroundColor="#6BF2C2" radius={20} onPress={onBack}>
              <View className="items-center py-[15px]">
                <Text className="font-fredoka-700 text-[21px]" style={{ color: '#0A3B2C' }}>
                  Back to the cards
                </Text>
              </View>
            </ToyShadow>
          </View>
        </View>
      </View>
    </>
  );
}

/* The turn.

   **No `rotateY`, deliberately — it is what was breaking this screen.** A layer carrying a real 3D
   rotation leaks its rendering context to its siblings on iOS: with the card rotating, the footer
   buttons below rendered as a clipped half of themselves, and swapped which half depending on which
   way the card was facing. Proved by elimination — the same screen with the animation removed lays
   out perfectly. Backface flags, perspective, and the subtree's own layout were all ruled out first;
   the rotation itself is the trigger.

   So the card turns on `scaleX` instead, which is a plain 2D transform and carries no 3D context.
   That alone would read as a squash, so three cues do the rest of the work:

     · the horizontal squeeze runs 1 → 0 → 1, so the card genuinely passes through edge-on
     · a shading overlay peaks exactly at the edge, the way a real card darkens as it turns away from
       the light — this is what your eye actually reads as depth
     · a uniform scale and a small lift bring it toward you across the turn, overshooting once before
       it settles

   One turn, on arrival. The design's card loops so the motion is visible on a static canvas; here it
   happens once, because the second turn would be the app replaying itself.

   Everything inside is absolutely positioned against one fixed CARD_W × CARD_H frame — including the
   cream card's toy shadow, drawn by hand as two slabs rather than reusing ToyShadow — so the animated
   subtree takes no part in the screen's layout at all. */
function FlipCard({ aura, accent }: { aura: Aura; accent: string }) {
  const grade = gradeLabel(aura.grade);
  /* Split at the first space, so a two-part surname ("Van Dyke") stays on its own line rather than
     losing its tail. `firstName` falls back the way `shortName` does, for a name that never arrived. */
  const nameParts = (aura.name ?? '').trim().split(/\s+/);
  const firstName = nameParts[0] || 'Someone';
  const lastName = nameParts.slice(1).join(' ');

  const turn = useSharedValue(0);
  const burst = useSharedValue(0);

  /* Keyed on the name, not on mount.

     The card arrives face down and waits — you tap Flip, the name lands, and *that* is what turns it.
     Running on mount would have spun an unnamed card round to a blank front face after 950ms.

     Still fires immediately for a card opened after the fact, since its name is already there on the
     first render: same one turn, same reason it isn't a loop. */
  const turned = !!aura.name;
  useEffect(() => {
    if (!turned) return;
    // inOut, not out: a rotation speeds up into the edge and slows out of it. Linear-out reads as a
    // window blind going up.
    turn.value = withTiming(1, { duration: 950, easing: Easing.inOut(Easing.cubic) });
    // Delayed so the ring reads as thrown off by the card landing, rather than racing it.
    burst.value = withSequence(
      withTiming(0, { duration: 800 }),
      withTiming(1, { duration: 900, easing: Easing.out(Easing.ease) })
    );
  }, [turned, turn, burst]);

  const card = useAnimatedStyle(() => ({
    transform: [
      // The turn itself. Through 0 at the halfway point, so the card really does pass edge-on.
      { scaleX: interpolate(turn.value, [0, 0.5, 1], [1, 0, 1]) },
      /* Dips at the edge and overshoots once before it settles.

         Both ends are pinned at exactly 1, and that is the whole point. This used to start at 0.88 so
         the card would grow toward you across the turn — but `turn` sits at 0 for as long as the card
         is face down, which meant the resting, un-flipped card was permanently rendered at 88%. The
         card you decide over was 12% smaller than the card you get, and every attempt to fix that by
         raising CARD_H moved both. An animation's value at rest is a layout decision, not a motion
         one; anything that isn't 1 at t=0 silently resizes the idle screen. */
      { scale: interpolate(turn.value, [0, 0.5, 0.85, 1], [1, 0.94, 1.05, 1]) },
      { translateY: interpolate(turn.value, [0, 0.5, 1], [0, 4, 0]) },
      // A hair of skew on the way through — the parallax a real card shows as its far edge recedes.
      { skewY: `${interpolate(turn.value, [0, 0.5, 1], [0, 5, 0])}deg` }
    ]
  }));
  /* The shading. Peaks at the edge and clears as the face comes round, which is the cue that turns a
     horizontal squeeze into a rotation — without it the card reads as a blind opening.

     Both ends pinned at 0, for the same reason `scale` above is pinned at 1: `turn` sits at 0 for as
     long as the card is face down, so anything non-zero at t=0 is not an animation, it's a permanent
     restyle of the idle screen. This started at 0.3, which put a 30% black wash over the card you sit
     looking at while deciding whether to spend a flip — the sender's accent, their gender colour and
     the poll emoji all arrived visibly duller here than on the grid card you tapped to get here, and
     the two are supposed to be the same object. */
  const shade = useAnimatedStyle(() => ({ opacity: interpolate(turn.value, [0, 0.5, 1], [0, 0.62, 0]) }));

  /* The faces are swapped by opacity at the halfway point rather than by `backfaceVisibility`, which
     is a 3D property and belongs to the same family as the rotation this animation avoids. The swap
     lands at 0.5, where the card is edge-on and neither face has any width to be seen in. */
  const frontFace = useAnimatedStyle(() => ({ opacity: turn.value > 0.5 ? 1 : 0 }));
  const backFace = useAnimatedStyle(() => ({ opacity: turn.value > 0.5 ? 0 : 1 }));

  /* Kept faint. Without `filter: blur()` this halo is a hard-edged slab, and at the design's .34 it
     reads as a coloured backing board rather than as light coming off the card.

     It swells as well as brightening. Opacity alone was the whole animation, and a hard-edged shape
     changing only its alpha doesn't read as breathing — it reads as a light being dimmed, which is a
     flicker rather than a motion. Scaling the slab with the brightness is what makes it move.

     The swell is deliberately small. At ±5% it read as the card itself pumping, which drags the eye to
     the wrong object — this is meant to be light coming off something at rest, so the motion has to be
     the kind you notice without watching. */
  const ring = useAnimatedStyle(() => ({
    opacity: interpolate(burst.value, [0, 0.25, 1], [0, 0.8, 0]),
    transform: [{ scale: interpolate(burst.value, [0, 1], [0.55, 1.35]) }]
  }));

  return (
    <View style={{ width: CARD_W, height: CARD_H }}>
      {/* The breathing halo lived here and is gone.

          Without `filter: blur()` it was a hard-edged slab sitting a few points outside the card, which
          reads as a coloured backing board rather than as light — tolerable when the card was small and
          the screen was busy, obvious once the card became the whole screen. No amount of tuning the
          opacity or the swell fixed the fact that it has a visible edge.

          The pulse moved to the Flip button (see Reveal), where a soft breath on a rounded shape is
          doing a job — drawing the eye to the one thing you're meant to press — rather than decorating
          an object that is already the largest thing in view.

          Scoped to this screen only: the Aura grid's roaming glow is RoamGlow in auraKit, a different
          component with a different job, and it is untouched. */}
      <Animated.View
        pointerEvents="none"
        style={[
          { position: 'absolute', top: -30, left: -30, right: -30, bottom: -30, borderRadius: 999, borderWidth: 3, borderColor: accent },
          ring
        ]}
      />

      <Animated.View style={[{ position: 'absolute', width: CARD_W, height: CARD_H }, card]}>
        {/* The back — the face you're turning over.

            It carried the aura mark alone, which was enough when this screen only ever showed a card
            mid-reveal. Now you sit looking at it deciding whether to spend a flip, and the things that
            decision rests on are exactly what a face-down card gives away for free: the prompt they
            picked you for, their gender, their grade. Same three the grid shows, at the size this
            screen is for — so the card you tapped and the card you're looking at are the same object.

            Edged in the sender's accent, like the grid's. The old flat '#403E41' border was neutral
            because the mark inside was already carrying the colour. */}
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: CARD_W,
              height: CARD_H,
              borderRadius: 26,
              backgroundColor: TRACK,
              borderWidth: 2.5,
              borderColor: accent,
              alignItems: 'center',
              justifyContent: 'center',
              // Room for the protected line to wrap without touching the border.
              paddingHorizontal: 20
            },
            /* The purple backlight, from the original design — and this time it's a real blur.

               A halo lived on this card once and was cut, because it was drawn as a bordered View
               sitting a few points outside the card: without `filter: blur()` that's a hard-edged
               slab, and it read as a coloured backing board rather than as light. Deleting it was
               right; the technique was wrong.

               `shadowRadius` is the fix. iOS renders view shadows as a genuine Gaussian blur, so a
               zero-offset shadow in the sender's purple *is* backlighting — soft at the edges, no
               geometry of its own, nothing to line up against the card's corners. It costs one style
               object rather than an extra layer, and it can't drift out of register during the turn
               because it belongs to the face itself.

               Protected cards only. The glow is doing a job here — it marks the one card in the deck
               that is lit from behind because it will never open — and putting it on every card would
               turn a signal back into decoration, which is how the first halo died.

               Android caveat: `shadowColor` is iOS-only, and `elevation` can't do a coloured glow.
               This degrades to no glow there rather than to something wrong. */
            aura.anonymous && {
              shadowColor: PROTECTED_GLOW,
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.95,
              shadowRadius: 34
            },
            backFace
          ]}
        >
          {/* Grown with the card. A frame that gets 28% bigger while its contents hold still doesn't
              read as a bigger card, it reads as the same card with more margin — the emoji is the
              anchor of this face, so it takes the increase.

              On a protected card the aura mark takes the disc instead of the poll's emoji, the way the
              original design had it. The emoji is a fact about the *vote* — which quiz they picked you
              for — and on a card whose whole subject is the sender's membership it's the one detail
              pulling attention somewhere else. Swapping it makes the disc say the same thing as the
              backlight and the line below, so the card carries one idea rather than two. */}
          <View
            className="items-center justify-center"
            style={{ width: 118, height: 118, borderRadius: 99, backgroundColor: '#403E41' }}
          >
            {aura.anonymous ? (
              <AuraIcon name="aura" size={58} color={PROTECTED_MARK} filled />
            ) : (
              <Text style={{ fontSize: 52 }}>{aura.emoji}</Text>
            )}
          </View>
          {/* Lavender on a protected card, the sender's own accent everywhere else.

              The accent's job is to say boy/girl at a glance, and it keeps doing that here — the word
              still reads "Boy". What changes is that on this one card every coloured thing (mark,
              word, message, backlight) belongs to the same idea, instead of the gender colour being a
              lone blue note in a purple frame. */}
          <Text
            className="font-fredoka-700 mt-[20px] text-[44px] leading-[48px]"
            style={{ color: aura.anonymous ? PROTECTED_INK : accent }}
          >
            {genderWord(aura)}
          </Text>
          {gradeShort(aura.grade) ? (
            <Text className="font-nunito-900 mt-[8px] text-[25px]" style={{ color: CREAM_INK_MUTED }}>
              {gradeShort(aura.grade)}
            </Text>
          ) : null}
          {/* The last line: why this card won't turn, or how much this person likes you.

              Never both. On a protected card the vote count is actively unwanted — it's a measure of
              how badly you want the name, printed directly above the sentence explaining that you
              can't have it, which turns an explanation into a taunt. The two facts are also answering
              different questions: one argues for spending a flip, the other says no flip is possible.

              This line sits inside the card rather than above it because it belongs to *this sender*,
              not to the screen. The caption above the card is about your situation (what you have left
              to spend); the sender having Infinite Aura is a fact about them, and it reads as one when
              it's printed on their card. */}
          {aura.anonymous ? (
            /* One quiet line. It has been a glowing 25px paragraph and a pill-shaped badge, and both
               were the same mistake in different clothes: decorating the message.

               The card is backlit purple now, and that's the announcement — a whole card lit from
               behind says "this one is different" far better than anything printed inside it can. Once
               the glow is doing that job, a badge is a second thing shouting the same news, and the
               text is free to just say the thing and stop.

               Lavender rather than the muted grey the vote count uses, because it's the only element
               tying the words to the light around them; grey would read as unrelated fine print on a
               purple card. No text-shadow — the glow belongs to the card, and a second one here is
               what made the 25px version look like an error dialog. */
            /* The break is explicit, not left to the wrap.

               Left to itself the line broke after "like", stranding "you ;)" alone on line two. The
               ellipsis is already a beat — the pause before the punchline — so breaking there puts
               the line where the sentence was going to pause anyway, and it holds at any width
               instead of moving with the font size or the card. */
            <Text
              className="font-nunito-800 mt-[20px] text-center text-[18px] leading-[25px]"
              style={{ color: PROTECTED_INK }}
            >
              {'Infinite aura user...\njust like you ;)'}
            </Text>
          ) : (
            /* How many times this person has voted for you.

               The prompt used to sit here and it's gone — that's the other side's to give.

               **The Activity feed does print it, though**, on the row that opens this card (see
               pickLine in auraTab). That asymmetry is known and deliberate — the feed needs the one
               detail that differs between rows or it reads as the same line repeated — but it does
               mean this card is less specific than the row you tapped to reach it. If that ever grates,
               the answer is to put the prompt back on this face rather than to take it out of the feed.

               What
               replaced it is the one fact that actually argues for spending a flip on *this* card
               rather than the one beside it: someone who voted for you four times is a different
               proposition from someone who voted once.

               `pickCount` is server-derived and already on the aura — it's what the grid's repeat-
               admirer badge counts — so this is a number the app already knew, finally shown where the
               decision is made. "Voted" matches the front face; the card used to say "picked" on one
               side and "voted" on the other, which reads as two different actions. */
            <Text
              className="font-nunito-800 mt-[18px] text-center text-[18px] leading-[23px]"
              style={{ color: '#8B888D' }}
            >
              {aura.pickCount > 1 ? `Voted for you ${aura.pickCount} times` : 'Voted for you once'}
            </Text>
          )}
        </Animated.View>

        {/* The front. Slab, then face, then content — ToyShadow's two layers, inlined as absolutes. */}
        <Animated.View style={[{ position: 'absolute', width: CARD_W, height: CARD_H }, frontFace]}>
          <View style={{ position: 'absolute', inset: 0, borderRadius: 26, backgroundColor: CREAM_RULE }} />
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: CARD_W,
              height: CARD_H - LIFT,
              borderRadius: 26,
              backgroundColor: '#FFF6E8',
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 22
            }}
          >
            {/* The quiz's emoji, not the name's initial.

                An initial-in-a-circle is a stand-in for a profile picture, and this app has no profile
                pictures — so it was inventing an avatar out of a letter you can already read in full
                directly underneath it. The emoji is the one that was on the poll they voted on, which
                makes it the same object on both sides of the turn: it sits on the face-down card, and
                it's still there when the card comes round. Nothing on the front face was carrying that
                continuity before.

                Same accent disc it always had — on the cream face it's the only thing holding the
                sender's colour, and losing it would flatten the card to beige. The disc stays at 86
                while the glyph grows: the emoji is the subject, the circle is just its ground, and
                widening the ground to match would push the name down the card for no gain. */}
            <View
              className="items-center justify-center"
              style={{ width: 86, height: 86, borderRadius: 99, backgroundColor: accent }}
            >
              <Text style={{ fontSize: 48 }}>{aura.emoji}</Text>
            </View>
            {/* The whole name, stacked — not "Shrimply G."

                `shortName` cuts the surname to an initial, which is right in the grid where a card is
                thumbnail-sized and a long name would wrap into the artwork. This card is the thing the
                flip was spent on, and handing over a surname as one letter is withholding the answer
                at the moment it's meant to be given. The full name has always been in the payload —
                the API sends `firstName lastName` and only the grid's formatter was trimming it.

                Two lines rather than one, because a full name at this size doesn't fit across the card
                and letting it wrap on its own would break wherever the width happened to run out. The
                split at the space is the one place a name is meant to break.

                `adjustsFontSizeToFit` is the guard for the long ones: a 14-character surname shrinks
                to fit its own line instead of clipping, and short names are untouched. */}
            <Text
              className="font-fredoka-700 mt-4 text-center text-[29px] leading-[33px]"
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{ color: '#2D2A2E' }}
            >
              {firstName}
            </Text>
            {!!lastName && (
              <Text
                className="font-fredoka-700 text-center text-[29px] leading-[33px]"
                numberOfLines={1}
                adjustsFontSizeToFit
                style={{ color: '#2D2A2E' }}
              >
                {lastName}
              </Text>
            )}
            {/* Grade only. The school used to print here and it's the same school for everybody — a
                line every card shares tells you nothing about the person on this one. */}
            {!!grade && (
              // Same ink as the grid card's grade, for the same reason — #8B7F69 was fainter still.
              <Text className="font-nunito-800 mt-[8px] text-[18px]" style={{ color: CREAM_GRADE }}>
                {grade}
              </Text>
            )}
            <View
              className="mt-4 w-full items-center pt-[14px]"
              style={{ borderTopWidth: 2, borderStyle: 'dashed', borderColor: CREAM_RULE }}
            >
              <Text className="font-nunito-900 text-[11px]" style={{ color: CREAM_INK_MUTED, letterSpacing: 0.7 }}>
                VOTED YOU FOR
              </Text>
              <Text
                className="font-fredoka-700 mt-[5px] text-center text-[17px] leading-[20px]"
                numberOfLines={2}
                style={{ color: '#2D2A2E' }}
              >
                {aura.q}
              </Text>
              {/* When, and how often — the two things the prompt alone doesn't tell you.

                  A vote from this morning and one from three weeks ago mean different things about
                  where you stand with someone, and so does a fourth vote versus a first. Both are
                  already on the aura (`ts` is the vote's own timestamp, `pickCount` the voter's total
                  at you), so neither costs a request.

                Two rows, not one dot-separated line. They were one line while both halves were short,
                but "Tuesday, 7:55 PM · has voted for you 4 times" overflows the card and wraps with
                "times" orphaned on a line of its own, which looks like a bug. Once the text needs two
                lines anyway, choosing where it breaks costs nothing and reads far better than letting
                the wrap land mid-phrase.

                See `voteStamp` above for why this card times the vote more precisely than the feed. */}
              <Text className="font-nunito-800 mt-[10px] text-center text-[15px]" style={{ color: CREAM_GRADE }}>
                {voteStamp(aura.ts)}
              </Text>
              <Text className="font-nunito-800 mt-[3px] text-center text-[15px]" style={{ color: CREAM_GRADE }}>
                {`Has voted for you ${aura.pickCount} ${aura.pickCount === 1 ? 'time' : 'times'}`}
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* Over both faces, inside the turning layer, so it darkens whichever one is showing. */}
        <Animated.View
          pointerEvents="none"
          style={[
            { position: 'absolute', width: CARD_W, height: CARD_H, borderRadius: 26, backgroundColor: '#0B0A0C' },
            shade
          ]}
        />
      </Animated.View>
    </View>
  );
}
