import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming
} from 'react-native-reanimated';
import { useIAP, ErrorCode, type Purchase } from 'react-native-iap';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShop } from '../../src/hooks/useShop';
import { useValidateIap } from '../../src/hooks/useValidateIap';
import { INFINITE_AURA_TIERS, INFINITE_AURA_PRODUCT_IDS, type InfiniteAuraTier } from '../../src/lib/iap';
import { AuraIcon } from '../../src/components/AuraIcon';
import { ToyShadow } from '../../src/components/ToyShadow';
import { Wobble } from '../../src/components/Wobble';
import { AuthError } from '../../src/components/authKit';
import { PROTECTED_MARK } from '../../src/components/auraKit';

/* Lavender, not mint — and it's the one colour on the screen that isn't a preference.

   PROTECTED_MARK is what the app already paints a card whose sender has Infinite Aura: the grid card
   goes lavender, the flip screen's glow goes lavender, and the reason is always this product. Selling
   it in mint meant the paywall was the only surface where the entitlement wore a different colour
   from the thing it buys. Imported rather than re-typed so it can't drift from those cards. */
const IA_INK = PROTECTED_MARK; // #B5A3FF — glyphs and type on the dark ground
const IA_FILL = '#7C5CFF'; // the tailwind `purple`, for the one filled tier card
const IA_FILL_SHADOW = '#5334D6'; // `purple.shadow`

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
const SAMPLE = { poll: '🥵 HOTTEST IN THE JUNIOR CLASS', who: 'Girl', grade: '11th', name: 'Maya' };

/* 176 is the live grid's CARD_HEIGHT (auraKit). Matching it matters more now that there's only one
   card on this screen — it's a portrait card the reader has seen a hundred times on the Aura tab, and
   the paywall showing a differently-proportioned one would be advertising a card the app doesn't
   deliver. The face-up state subtracts its ToyShadow depth so the drawn slab ends level with the
   face-down card's border rather than 5pt below it. */
const CARD_H = 176;

export default function InfiniteAura() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: shop } = useShop();
  const validateIap = useValidateIap();

  const flips = shop?.dailyFlips ?? 2;
  // Already a member: this screen has nothing to sell, so send them to where the state is shown.
  const member = !!shop?.infiniteAura;

  /* The real purchase path. `legacyInfiniteAura` (the free dev unlock) used to live on this screen's
     buy button — it's gone from here entirely now, not just replaced: it's still reachable from
     Settings' `__DEV__` panel, gated the same way, so nothing about local testing was lost by making
     this screen 100% the StoreKit flow.

     `purchasing` is local rather than derived from `requestPurchase`'s own promise, because that
     promise resolves the moment the system sheet is *shown* — "dispatched", per the hook's own docs —
     not when the purchase settles. The real outcome arrives later, asynchronously, through
     `onPurchaseSuccess` / `onPurchaseError`, which is also where `purchasing` gets turned back off. */
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [selectedTier, setSelectedTier] = useState<InfiniteAuraTier['key']>('lifetime');

  const { connected, products, subscriptions, requestPurchase, finishTransaction, fetchProducts, restorePurchases } =
    useIAP({
      /* Fires for a live purchase *and*, as far as I can tell from react-native-iap's own docs, for a
         restored one too — OpenIAP (the spec this library implements) funnels every delivery through
         one purchase-updated event, live or replayed. That's an assumption I could not verify against
         a real sandbox account (no Apple Developer enrollment yet, see CLAUDE.md), so treat it as the
         thing to confirm first against a TestFlight build, not settled fact.

         `validateIap` is the whole trust boundary: the client hands over the raw JWS and does nothing
         with it — the server parses it only after checking the signature (apps/api/src/iap.ts). If
         validation fails, the transaction is deliberately left unfinished (no `finishTransaction`
         call) rather than erroring it away: StoreKit replays an unfinished transaction on next launch,
         which gives a transient server hiccup a second chance instead of eating the purchase. */
      onPurchaseSuccess: async (purchase: Purchase) => {
        try {
          if (!purchase.purchaseToken) throw new Error('No receipt on this transaction');
          await validateIap.mutateAsync(purchase.purchaseToken);
          await finishTransaction({ purchase, isConsumable: false });
          router.replace('/shop');
        } catch {
          // Left unfinished — see the note above. validateIap.isError already surfaces the message.
        } finally {
          setPurchasing(false);
          setRestoring(false);
        }
      },
      onPurchaseError: error => {
        setPurchasing(false);
        setRestoring(false);
        // A cancelled system sheet isn't a failure — it's the user closing a dialog they opened.
        if (error.code !== ErrorCode.UserCancelled) setPurchaseError(error.message);
      }
    });

  // Runs once, the moment the store connects — not on every render react-native-iap happens to give
  // fetchProducts a new identity, and not more than once per mount.
  const fetchedProducts = useRef(false);
  useEffect(() => {
    if (connected && !fetchedProducts.current) {
      fetchedProducts.current = true;
      void fetchProducts({ skus: INFINITE_AURA_PRODUCT_IDS, type: 'all' });
    }
  }, [connected, fetchProducts]);

  const tier = INFINITE_AURA_TIERS.find(t => t.key === selectedTier)!;
  // Subscriptions and non-consumables land in separate arrays from one fetchProducts call — StoreKit
  // itself distinguishes them, this isn't a client-side sort.
  const tierProduct =
    tier.type === 'subs' ? subscriptions.find(s => s.id === tier.id) : products.find(p => p.id === tier.id);

  async function buy() {
    setPurchaseError(null);
    setPurchasing(true);
    try {
      // Apple only: this app has no Android product catalogue yet (the coin packs are in the same
      // boat — shop.tsx's own copy already says "Billed through the App Store").
      await requestPurchase({ request: { apple: { sku: tier.id } }, type: tier.type });
    } catch (e) {
      setPurchasing(false);
      setPurchaseError((e as Error).message);
    }
  }

  /* `restorePurchases()` resolving only means "the store finished syncing" — same dispatched-not-
     settled shape as requestPurchase — so this clears the spinner on that signal rather than waiting
     for a restored entitlement to land through onPurchaseSuccess (which may fire a beat later, or not
     at all if there's nothing to restore). If a restore *does* trigger onPurchaseSuccess, that handler
     clears `restoring` again on its own — this just means the button can go quiet slightly before the
     entitlement finishes applying, not that anything is skipped. */
  async function restore() {
    setPurchaseError(null);
    setRestoring(true);
    try {
      await restorePurchases();
    } catch (e) {
      setPurchaseError((e as Error).message);
    } finally {
      setRestoring(false);
    }
  }

  /* The buy button rocks, with the aura mark's exact numbers: -2.5° → 2.5° → -2.5°, 1500ms each leg,
     ease-in-out. Copied from Wobble rather than wrapping in it, because Wobble's Animated.View sizes
     to its content and this button needs a width set on it — the values are the point, not the
     component. Two things on screen moving on the same clock read as one idea; two near-misses read
     as a bug.

     Worth flagging: Wobble's own note says it "applies to the emoji glyph itself, never a container".
     Putting it on a button is a deliberate departure from that rule, not an oversight.

     Declared at the top level, not inside the non-member branch: the button is conditional and hooks
     can't be. Both animations stop while the purchase is in flight — a control that keeps inviting a
     press it's already handling reads as though the first press missed. */
  const wobble = useSharedValue(-2.5);
  useEffect(() => {
    wobble.value = withRepeat(
      withSequence(
        withTiming(2.5, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(-2.5, { duration: 1500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, [wobble]);
  const wobbling = useAnimatedStyle(() => ({
    transform: [{ rotate: `${purchasing ? 0 : wobble.value}deg` }]
  }));

  /* The glow behind it — a real radial gradient, the same technique the cold-start wordmark uses
     (LoadingScreen). Stacked translucent discs leave visible edges, and this is mostly edge.

     Deliberately off the wobble's clock: 1400ms against the rock's 3000ms, so the two never lock into
     a single beat. A glow that brightened exactly at the top of each swing would read as one clumsy
     animation rather than a lit object that happens to be moving. */
  const glow = useSharedValue(0);
  useEffect(() => {
    glow.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [glow]);
  const glowing = useAnimatedStyle(() => ({
    opacity: purchasing ? 0 : interpolate(glow.value, [0, 1], [0.22, 0.5])
  }));

  return (
    /* The 21pt gutter lives on the ScrollView's *content*, not on this View, so the ScrollView itself
       spans the full screen — and a ScrollView clips anything outside its frame. With the padding out
       here the frame ended exactly where the content did, so the buy button's animation sheared its
       own edges off every cycle, and its glow would now be cut into a rectangle. Full-bleed, both
       spill into the gutter instead. */
    <View className="flex-1 bg-ground" style={{ paddingTop: insets.top + 14 }}>
      {/* Lifted out of the flow and given a disc.

          In the layout it owned a full row, so a 22px glyph pushed the whole pitch down by its own
          height plus the row's — and it still read as faint grey chrome. Absolute, it costs nothing
          vertically and the title starts at the top; on a `surface` disc at ink-secondary it reads as
          a button. It sits above the ScrollView's own content in z-order, and there's nothing at the
          top-right to collide with — the title, the mark and the pitch are all left-aligned. */}
      <Pressable
        onPress={() => router.back()}
        hitSlop={14}
        accessibilityLabel="Close"
        className="h-[36px] w-[36px] items-center justify-center rounded-pill bg-surface"
        style={{ position: 'absolute', top: insets.top + 14, right: 21, zIndex: 10 }}
      >
        <AuraIcon name="close" size={19} color="#C1C0C0" />
      </Pressable>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 21 }}>
        <View className="mt-[2px] flex-row">
          <Wobble>
            <AuraIcon name="aura" size={38} color={IA_INK} filled />
          </Wobble>
        </View>
        {/* Two lines, two colours — the product name is the app's name doing something extra. */}
        <Text className="font-fredoka-700 mt-1 text-[38px] leading-[39px]" style={{ color: IA_INK }}>
          Infinite
        </Text>
        <Text className="font-fredoka-700 text-[38px] leading-[39px]" style={{ color: '#FF5CA8' }}>
          Aura
        </Text>
        {/* No subtitle. It read "{flips} flips a day. Each one turns a card over and keeps the name."
            — which is the before/after pair directly below it said in words, and then the first bullet
            ("2 name reveals every day, back again tomorrow") said again a few lines further down. The
            product name, the demo, and the list are the pitch. */}

        {/* One card that turns itself over, rather than the before and after standing side by side.

            Two static cards with an arrow between them described the transaction; this performs it.
            The product is one card and one moment — you spend a flip and that exact card turns — and a
            row of two was showing something the app never does, since the face-down card doesn't stay
            behind after you flip it.

            Still nothing tappable. The card turns on its own clock, so the screen never implies you
            can open one from here — a paywall that looked like it flipped a card on demand would be
            lying about what it just did. */}
        <View className="mt-5 items-center">
          <SampleFlipper />
        </View>

        {/* Every line checked against the resolver, not the type's doc comment — which is how a false
            one got in here. "Their grade comes with the name" is gone: `grade` is free on a face-down
            card and always has been. aurasFor returns it to everyone (`grade: detailHidden ? '' :
            voter.grade`) and says so at length — "What the flip buys is the *name*, and only that."
            The Aura type in useAuras.ts still described grade as arriving with the name; that comment
            was stale and is corrected there too. A paywall charging for something already free is the
            worst kind of inaccurate, so this one mattered more than the rest.

            Two things this entitlement really does were also missing from the pitch entirely:

            - Your own votes go anonymous. `aurasFor` sets a card's `anonymous` from the *voter's*
              membership (auras.ts: `anonymous = !!(voter && voter.infiniteAura)`), and an anonymous
              card can never be flipped at any price — flip.tsx excludes it from the upsell for exactly
              that reason. friendActivityFor withholds a member's gender from friends' feeds too. That
              is arguably the strongest thing on this list and it wasn't being sold at all.
            - Locked superlatives. profile.tsx caps a non-member at FREE_CHIPS (3) and routes the
              "N still locked" chip *to this screen* — so the paywall was the one place that didn't
              mention what that chip was selling.

            The rest hold up: dailyFlips resets per UTC day (flipState), a flip works on any unflipped
            card in the 30-day window, and nothing notifies the sender on reveal. */}
        <View className="mt-4 gap-2">
          <Benefit>{`${flips} name reveals every day, back again tomorrow`}</Benefit>
          <Benefit>Works on the cards already waiting for you</Benefit>
          <Benefit>Your own picks stay anonymous — nobody can ever flip you</Benefit>
          <Benefit>Every superlative you've won unlocks on your profile</Benefit>
          <Benefit>They never find out you flipped them</Benefit>
        </View>

        {/* Tiers, now real and tappable — they were static cards with no way to act on either.

            The design's copy is untouched ("SEMESTER" is the label the design gave the lifetime
            product — CLAUDE.md's naming exceptions cover the *id*, `aura.godmode.lifetime`, not this
            screen's wording, and rewriting sale terms wasn't this task). What's genuinely new:
            selection. Both cards keep their fixed styling (grey for weekly, filled purple for
            lifetime, BEST DEAL pinned to lifetime) — that's the design's fixed hierarchy, not a
            selection state — so which one is *chosen* needs its own signal. A lavender ring on
            whichever card is selected is that signal, laid on top without touching either card's base
            look. Price prints once StoreKit answers `fetchProducts`; until then the card still shows
            the tier's shape, same posture the old placeholder comment argued for. */}
        <View className="mt-4 flex-row gap-[11px]">
          <Pressable
            onPress={() => setSelectedTier('weekly')}
            className="flex-1 rounded-22 bg-surface px-[13px] py-[15px]"
            style={{ borderWidth: 2, borderColor: selectedTier === 'weekly' ? IA_INK : 'transparent' }}
          >
            <Text className="font-nunito-900 text-[12px] text-ink-dim">WEEKLY</Text>
            <Text className="font-nunito-700 mt-1 text-[12px] text-ink-dim">
              {subscriptions.find(s => s.id === 'aura.godmode.weekly')?.displayPrice ?? 'every week'}
            </Text>
          </Pressable>
          <View className="flex-1">
            <View style={{ position: 'absolute', top: -12, left: 11, zIndex: 1 }}>
              <View className="rounded-pill bg-pink px-[10px] py-1" style={{ transform: [{ rotate: '-3deg' }] }}>
                <Text className="font-nunito-900 text-[10.5px] text-white">BEST DEAL</Text>
              </View>
            </View>
            {/* White ink here, where the mint version used a dark green. The lavender fill is far
                darker than mint was, so the old trick of tinting the label with a deeper shade of the
                fill doesn't survive the swap — it would be dark-on-dark. */}
            <ToyShadow
              depth={5}
              shadowColor={IA_FILL_SHADOW}
              backgroundColor={IA_FILL}
              radius={22}
              onPress={() => setSelectedTier('lifetime')}
              style={{ borderWidth: 2, borderColor: selectedTier === 'lifetime' ? IA_INK : 'transparent' }}
            >
              <View className="px-[13px] py-[15px]">
                <Text className="font-nunito-900 text-[12px] text-white">SEMESTER</Text>
                <Text className="font-nunito-700 mt-1 text-[12px]" style={{ color: '#E4DDFF' }}>
                  {products.find(p => p.id === 'aura.godmode.lifetime')?.displayPrice ?? 'best value'}
                </Text>
              </View>
            </ToyShadow>
          </View>
        </View>

        {(purchaseError || validateIap.isError) && (
          <AuthError message={purchaseError ?? (validateIap.error as Error).message} />
        )}

        {/* `flex-1 justify-center` inside a `flexGrow: 1` content container, so the button sits
            centred in whatever room is left between the tier cards and the tab bar rather than tucked
            under the cards with all the slack below it. Fixed margins couldn't do this — the gap
            depends on device height, and the block above it changes height with the benefit list. */}
        <View className="my-5 flex-1 items-center justify-center gap-[11px]">
          {member ? (
            <>
              <View className="w-full items-center rounded-pill bg-surface py-[18px]">
                <Text className="font-fredoka-700 text-[20px]" style={{ color: IA_INK }}>
                  You have Infinite Aura
                </Text>
              </View>
              <Pressable onPress={() => router.replace('/shop')} hitSlop={8}>
                <Text className="font-nunito-800 text-[12.5px] text-ink-faint">See what's included →</Text>
              </Pressable>
            </>
          ) : (
            /* 76% rather than full width. A rocking button needs to look like an object sitting on
               the screen, and something spanning edge to edge reads as the screen itself tilting.
               Pulling it in also lets the glow spill sideways instead of running off the page. */
            <View className="w-[76%] items-center">
              {/* Inset negatively on all sides so the gradient's soft falloff starts outside the
                  button rather than at its edge. pointerEvents none — it must never eat the tap. */}
              <Animated.View
                pointerEvents="none"
                style={[
                  {
                    position: 'absolute',
                    top: -34,
                    bottom: -34,
                    left: -40,
                    right: -40,
                    experimental_backgroundImage: 'radial-gradient(circle, #FF5CA8 0%, rgba(255,92,168,0) 70%)'
                  },
                  glowing
                ]}
              />
              <Animated.View className="w-full" style={wobbling}>
                <ToyShadow
                  depth={5}
                  shadowColor="#C43A7C"
                  backgroundColor="#FF5CA8"
                  radius={9999}
                  onPress={buy}
                  disabled={purchasing || !connected}
                  style={purchasing || !connected ? { opacity: 0.6 } : undefined}
                >
                  <View className="items-center py-[18px]">
                    <Text className="font-fredoka-700 text-[22px] text-white">
                      {purchasing
                        ? 'Buying…'
                        : tierProduct
                          ? `Buy · ${tierProduct.displayPrice}`
                          : 'Buy Infinite Aura'}
                    </Text>
                  </View>
                </ToyShadow>
              </Animated.View>
              {/* Apple requires restore to be reachable from wherever purchases are offered, not
                  buried in Settings. Text link rather than a second button — it's the exception path,
                  not a third thing being sold. */}
              <Pressable onPress={restore} disabled={restoring} hitSlop={8} className="mt-3">
                <Text className="font-nunito-800 text-[12.5px] text-ink-faint">
                  {restoring ? 'Restoring…' : 'Restore purchases'}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function Benefit({ children }: { children: string }) {
  return (
    <View className="flex-row items-center gap-[11px]">
      <AuraIcon name="check" size={18} color={IA_INK} />
      <Text className="font-nunito-800 flex-1 text-[14.5px]" style={{ color: '#FCFCFA' }}>
        {children}
      </Text>
    </View>
  );
}

/* The demo: one card turning over every two seconds, forever.

   A real rotateY rather than a crossfade, because "flip" is the product's own word for the thing being
   sold — dissolving one card into another would be selling a different verb.

   Both faces are absolutely stacked and the *container* rotates; each face's opacity switches at the
   halfway point, with the back face pre-rotated 180° so it lands the right way round. That swap is
   what stands in for `backfaceVisibility`, which RN honours inconsistently across platforms — doing it
   in the animated style keeps the behaviour on the UI thread and identical everywhere.

   The interval is a genuine external system (a timer), which is what an Effect is for.

   The next target comes from a ref, not from reading `flip.value` back. Reading an animated shared
   value on the JS thread mid-flight is ambiguous — depending on timing it hands back either the
   current interpolated value or the target already assigned — and the first version of this did
   exactly that and stuck face-up, because every tick computed the same "next" state. A ref is the one
   source of truth the animation can't race. It's also why this isn't `useState`: flipping twice a
   second shouldn't re-render the screen. */
function SampleFlipper() {
  const flip = useSharedValue(0);
  const facingUp = useRef(false);

  useEffect(() => {
    const id = setInterval(() => {
      facingUp.current = !facingUp.current;
      flip.value = withTiming(facingUp.current ? 1 : 0, { duration: 620, easing: Easing.inOut(Easing.ease) });
    }, 2000);
    return () => clearInterval(id);
  }, [flip]);

  const spin = useAnimatedStyle(() => ({
    transform: [{ perspective: 900 }, { rotateY: `${interpolate(flip.value, [0, 1], [0, 180])}deg` }]
  }));
  const front = useAnimatedStyle(() => ({ opacity: flip.value < 0.5 ? 1 : 0 }));
  const back = useAnimatedStyle(() => ({ opacity: flip.value < 0.5 ? 0 : 1, transform: [{ rotateY: '180deg' }] }));

  return (
    <Animated.View style={[{ width: '52%', height: CARD_H }, spin]}>
      <Animated.View style={[{ position: 'absolute', left: 0, right: 0 }, front]}>
        <SampleCard state="down" />
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', left: 0, right: 0 }, back]}>
        <SampleCard state="up" />
      </Animated.View>
    </Animated.View>
  );
}

/* The two states of a card, drawn to match the real ones on the Aura tab.

   Face down is the dark card with the sender's accent and their gender — what everyone gets for free.
   Turned over is the cream card the app uses for good news, carrying the name, the grade and the
   superlative. Deliberately the same shapes and colours as the live grid: a paywall that invents its
   own illustration is selling something the app doesn't then deliver. */
function SampleCard({ state }: { state: 'down' | 'up' }) {
  const accent = '#FF5CA8'; // the sample sender is a girl; the real cards take this from her gender

  /* Both states are a plain full-width wrapper around a CARD_H box. The width comes from SampleFlipper
     now; what matters here is that the two faces stay structurally identical, since they stack on top
     of each other and any difference shows up as the card changing size mid-turn. They previously
     carried `flex-1` on different nodes and never resolved to the same width, and their heights
     matched only by coincidence — 148 against 143 plus a depth-5 shadow. */
  if (state === 'down') {
    return (
      <View className="w-full">
        <View
          className="items-center justify-center gap-[6px] px-[10px]"
          style={{ height: CARD_H, borderRadius: 18, backgroundColor: '#2C2A2D', borderWidth: 2.5, borderColor: accent }}
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
          {/* The grade belongs on the *face-down* card, because that's where the real one puts it —
              free, next to the gender. Leaving it off made the demo claim the flip buys it. */}
          <Text className="font-nunito-900 text-[12px]" style={{ color: '#8B888D', letterSpacing: 0.6 }}>
            {SAMPLE.grade.toUpperCase()}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className="w-full">
      <ToyShadow depth={5} shadowColor="#D9C7AF" backgroundColor="#FFF6E8" radius={18}>
        <View className="items-center justify-center gap-[5px] px-[10px]" style={{ height: CARD_H - 5 }}>
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
