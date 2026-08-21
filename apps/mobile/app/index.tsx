import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useIsFocused, useRouter } from 'expo-router';
import { Show, useAuth, useClerk, useSignIn, useSignUp } from '@clerk/expo';
import { useMe } from '../src/hooks/useMe';
import { useAuras } from '../src/hooks/useAuras';
import { callClerk } from '../src/lib/clerkCall';
import { toE164 } from '../src/lib/phone';
import { CODE_COOLDOWN_SECONDS, isRateLimited, useCooldown } from '../src/hooks/useCooldown';
import {
  AuthBrand,
  AuthButton,
  AuthError,
  AuthFooterLink,
  AuthHero,
  AuthLabel,
  AuthShell,
  AuthStatus,
  PhoneField
} from '../src/components/authKit';
import { RoamGlow, roamSlots, useRoamClock, type CardRoam } from '../src/components/auraKit';
import { ToyShadow } from '../src/components/ToyShadow';
import { LoadingGate } from '../src/components/LoadingScreen';
import { FullScreenFailure } from '../src/components/stateKit';
import { InfoCard, Strong } from '../src/components/settingsKit';
import { AuraIcon, type AuraIconName } from '../src/components/AuraIcon';

/* The four things the app actually does. One line each, nothing under it.

   Each tile briefly carried a sample beneath the label — a real prompt, what a face-down card says, a
   rank row, a superlative chip. They were accurate, and they were still helper text: the sample said
   the same thing the label already said, and paying for it in type size made the label small in a tile
   with room to spare. The label is the whole tile now, set large enough to read at a glance. */
const PILLARS: { icon: AuraIconName; accent: string; label: string }[] = [
  { icon: 'ballot', accent: '#6BF2C2', label: 'Vote on your class' },
  { icon: 'aura', accent: '#FF5CA8', label: 'Track your aura' },
  { icon: 'trophy', accent: '#FFD84D', label: 'Climb the ranks' },
  { icon: 'people', accent: '#7C5CFF', label: "See your friends' aura" }
];

export default function Home() {
  const { isLoaded } = useAuth();
  /* Same query key as SignedInGate's own useMe, so this is a second observer rather than a second
     request. Signed out it can't report loading: the hook is `enabled: isSignedIn === true`, and a
     disabled query is pending-but-not-fetching, which React Query reports as isLoading false. */
  const { isLoading: meLoading, refetch: refetchMe } = useMe();

  // 9A: the breathing wordmark covers exactly the two waits it names — the session resolving
  // (Clerk's isLoaded) and `me` fetching. Neither <Show> renders while Clerk is still deciding,
  // so without this the app opened on an empty ground-coloured screen.
  return (
    <LoadingGate loading={!isLoaded || meLoading} onRetry={() => refetchMe()}>
      <AuthShell>
        <Show when="signed-out">
          <Welcome />
        </Show>
        <Show when="signed-in">
          <SignedInGate />
        </Show>
      </AuthShell>
    </LoadingGate>
  );
}

/* The "one door" entry point: no sign-in / sign-up choice anywhere. */
function Welcome() {
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cooldown = useCooldown();

  /* The roaming light from the Aura tab's card grid, reused here rather than rebuilt: one clock for
     the whole grid, one tile lit at a time, and the visit order deliberately out of reading order so
     it doesn't scan as a sweep. roamSlots returns positions in visit order, so the array index is the
     slot — the same mapping the Inbox uses. */
  const clock = useRoamClock();
  const slotOfTile = new Map<number, number>();
  roamSlots(PILLARS.length).forEach((position, slot) => slotOfTile.set(position, slot));

  /* Clerk still needs to know up front whether this is a sign-in or a sign-up, but the design
     deliberately never asks — "the number tells us which they are". So we try to sign in first,
     and treat a failure as "this number has no account yet" and create one. If the create also
     fails we surface *its* message, since by then it's a real error rather than a missing account. */
  async function start() {
    setFormError(null);
    setBusy(true);
    const e164 = toE164(phone);

    const signInError = await callClerk(() => signIn.phoneCode.sendCode({ phoneNumber: e164 }));
    if (!signInError) {
      setBusy(false);
      // Clerk rate-limits per number, so a successful send locks the next one out too. Starting
      // the cooldown here means coming back to this screen shows the wait instead of a failure.
      cooldown.start(CODE_COOLDOWN_SECONDS);
      router.push({ pathname: '/verify', params: { phone, mode: 'signIn' } });
      return;
    }

    /* A rate-limit is NOT "this number has no account" — falling through to signUp.create would
       report a misleading error. It also means a code went out on an earlier attempt and is
       probably sitting in the user's messages, so send them to the code screen rather than
       stranding them here: the screen's own resend timer covers retrying. */
    if (isRateLimited(signInError)) {
      setBusy(false);
      cooldown.start(CODE_COOLDOWN_SECONDS);
      router.push({ pathname: '/verify', params: { phone, mode: 'signIn' } });
      return;
    }

    /* No `strategy: 'phone_code'` here on purpose. Passing it makes Clerk dispatch the code as part
       of create, and the explicit sendPhoneCode below then sends a SECOND one — which trips the
       per-number rate limit, so the user saw "too many requests" while still receiving the text
       from the first send, and never got forwarded to the code screen. Create the resource only;
       sending stays the one explicit step below. */
    const createError = await callClerk(() => signUp.create({ phoneNumber: e164 }));
    if (createError) {
      setBusy(false);
      if (isRateLimited(createError)) cooldown.start(CODE_COOLDOWN_SECONDS);
      setFormError(createError);
      return;
    }
    if (signUp.protectCheck) {
      setBusy(false);
      setFormError(
        'We can’t verify this device isn’t a bot yet. Enable Native API for this app in the Clerk dashboard to allow native sign-ups.'
      );
      return;
    }
    const sendError = await callClerk(() => signUp.verifications.sendPhoneCode());
    setBusy(false);
    if (sendError) {
      // Same reasoning as above: the sign-up resource is live and a code may already have gone
      // out, so a rate-limit here shouldn't be a dead end either.
      if (isRateLimited(sendError)) {
        cooldown.start(CODE_COOLDOWN_SECONDS);
        router.push({ pathname: '/verify', params: { phone, mode: 'signUp' } });
        return;
      }
      setFormError(sendError);
      return;
    }
    cooldown.start(CODE_COOLDOWN_SECONDS);
    router.push({ pathname: '/verify', params: { phone, mode: 'signUp' } });
  }

  return (
    <>
      {/* The wordmark, and nothing else.

          This card carried a headline through several rewrites — "Find out who's picking you.",
          "Aura check your whole class.", "Auramaxx with your whole school!" — and every one of them
          was a sentence explaining a screen that already shows four tiles saying what the app does.
          The name is the only thing here the tiles can't say.

          The wordmark used to sit above the card as its own element. Moving it inside and letting the
          card grow to hold it is what closes the gap that left behind, so the top of the screen is one
          object instead of a small mark floating over a mostly-empty panel. */}
      <AuthHero badge="YOUR SCHOOL ONLY" centerY>
        <AuthBrand centered fontSize={62} shadowHeight={8} />
      </AuthHero>
      {/* Two explicit rows, each flex-1, rather than a wrapped grid of fixed-height tiles.

          The tiles absorb whatever vertical space is left between the hero and the number field, which
          is what closes the dead half-screen this used to have — `mt-auto` on the block below only
          moved that gap, it didn't remove it. Growing the tiles to a fixed square would have closed it
          too, but AuthShell is a plain View with no scrolling, so on a 667pt phone that pushes the
          sign-in button off the bottom and the screen stops working entirely. Flexible rows are the
          version that fills a tall screen and merely gets shorter on a small one. */}
      <View className="mt-[18px] flex-1 gap-[11px]">
        <View className="flex-1 flex-row gap-[11px]">
          <PillarTile {...PILLARS[0]} roam={{ slot: slotOfTile.get(0) ?? 0, of: PILLARS.length, clock }} />
          <PillarTile {...PILLARS[1]} roam={{ slot: slotOfTile.get(1) ?? 0, of: PILLARS.length, clock }} />
        </View>
        <View className="flex-1 flex-row gap-[11px]">
          <PillarTile {...PILLARS[2]} roam={{ slot: slotOfTile.get(2) ?? 0, of: PILLARS.length, clock }} />
          <PillarTile {...PILLARS[3]} roam={{ slot: slotOfTile.get(3) ?? 0, of: PILLARS.length, clock }} />
        </View>
      </View>

      <View className="gap-3 pt-6">
        <AuthLabel>ENTER YOUR NUMBER TO START</AuthLabel>
        {/* PhoneField owns its own top margin for the inner screens; neutralised here so it sits
            in this bottom stack's 12px rhythm instead. */}
        <View className="-mt-[22px]">
          <PhoneField value={phone} onChangeText={setPhone} />
        </View>
        <AuthError message={formError} />
        {/* Disabled *and* counting down while Clerk's per-number window is open — otherwise the
            server's "wait 30 seconds" is a dead end: no timer, button still tappable, every tap
            fails again. */}
        <AuthButton
          label={cooldown.active ? `Try again in ${cooldown.label}` : busy ? 'Sending…' : 'Text me a code'}
          onPress={start}
          disabled={phone.trim().length === 0 || busy || cooldown.active}
        />
      </View>
    </>
  );
}

/* One of the four squares. Fills its row rather than taking a fixed 47.5% width and a natural height,
   so a tall screen gets tall tiles instead of a gap — see the grid comment above.

   Icon and label are one vertically-centred block. The Shop pins its icon to the corner, but these
   tiles stretch to fill the screen — pinning the icon top and the label bottom just moved the dead
   space inside each tile and made four small holes out of one big one.

   Icon centred above centred text. Type is sized to the *longest* label, since all four tiles share a
   height and one long label drags the size down for the other three — a longer wording here costs
   every tile its type size, not just its own. */
function PillarTile({
  icon,
  accent,
  label,
  roam
}: {
  icon: AuraIconName;
  accent: string;
  label: string;
  roam: NonNullable<CardRoam>;
}) {
  return (
    <View style={{ flex: 1, position: 'relative' }}>
      {/* Same composition as a card on the Aura tab: the halo is a sibling painted first, and the
          tile on top of it is opaque, so only the 9px ring around the edge shows. Its colour is the
          tile's own accent, so the light that travels the grid changes colour with whatever it lands
          on. Radius is the tile's 22 plus the 6 the halo is offset by — see RoamGlow. */}
      <RoamGlow accent={accent} roam={roam} radius={28} />
      <View className="flex-1 items-center justify-center rounded-22 bg-surface px-[12px] py-[16px]">
        <AuraIcon name={icon} size={52} color={accent} />
        <Text className="font-fredoka-700 mt-[13px] text-center text-[24px] leading-[27px] text-white">
          {label}
        </Text>
      </View>
    </View>
  );
}

/* Signed in: route on to wherever the user belongs. Onboarded users get the returning handoff
   first (it's the design's landing beat, not a spinner); everyone else goes to onboarding. */
function SignedInGate() {
  const { data, isError, refetch } = useMe();
  const { signOut } = useClerk();
  const router = useRouter();
  const isFocused = useIsFocused();

  /* The focus guard is load-bearing, not defensive. A stack keeps every route below the top one
     mounted, so this screen goes on observing `me` after it has sent the user to /onboarding.
     Without the guard, the first onboarding step that saves a field (age) invalidates `me`, this
     Effect sees fresh `data` with `onboarded` still false, and fires replace('/onboarding') a
     second time — REPLACE builds a *new* route object, so onboarding remounts with fresh state and
     the user lands back on step 1. It only bites on the sign-up path, where verify.tsx used to
     leave a second copy of this screen in the stack, which is why it looked intermittent. */
  useEffect(() => {
    if (!isFocused) return;
    if (data && data.onboarded === false) router.replace('/onboarding');
  }, [data, isFocused, router]);

  /* 10A's one full-screen failure. It earns that because nothing else on this screen can render
     without `me` — and the sign-out escape is mandatory, since a valid session pointing at an
     unloadable profile is otherwise a dead end. The error code is there so a support conversation
     can start with a fact instead of "it doesn't work". */
  if (isError) {
    return (
      <FullScreenFailure
        title="We can't load your account"
        body="You're still signed in — we just can't reach your profile right now. Nothing has been lost."
        primaryLabel="Try again"
        onPrimary={() => refetch()}
        secondaryLabel="Sign out instead"
        onSecondary={() => signOut()}
        footer={
          <InfoCard icon="shield">
            If it keeps happening, signing out and back in with your number fixes it. Error{' '}
            <Strong>ME_UNAVAILABLE</Strong>.
          </InfoCard>
        }
      />
    );
  }

  if (data && data.onboarded !== false) {
    return <ReturningHandoff name={data.firstName} grade={data.grade} school={data.school?.name ?? null} />;
  }

  /* Reached only in the window before `me` resolves, which LoadingGate is already covering — so this
     renders nothing rather than a competing "Loading…" underneath it. The 15s give-up reveals it, and
     by then either data or isError above has won. */
  return null;
}

function ReturningHandoff({
  name,
  grade,
  school
}: {
  name: string | null;
  grade: string | null;
  school: string | null;
}) {
  const router = useRouter();
  const { data: auras } = useAuras();
  const newAura = auras?.auras.filter(f => f.unread).length ?? 0;
  const first = (name || '').trim().split(/\s+/)[0] || 'you';
  /* Design shows "11th · Lakeview High". Grade is free-form on the server and includes
     non-numeric values ("Not in High School", "Already Graduated"), so only numeric grades get
     the "th" suffix. Either half can be missing — join drops the separator with it. */
  const gradeLabel = grade && /^\d+$/.test(grade) ? `${grade}th` : grade;
  const meta = [gradeLabel, school].filter(Boolean).join(' · ');

  // A deliberate beat, not a loader — long enough to read, short enough not to be a wall.
  useEffect(() => {
    const id = setTimeout(() => router.replace('/aura'), 1600);
    return () => clearTimeout(id);
  }, [router]);

  return (
    <View className="flex-1 items-center justify-center">
      <ToyAvatar initial={(first[0] || 'A').toUpperCase()} />
      <Text className="font-fredoka-700 mt-[20px] text-center text-[34px] leading-[37px] text-white">
        Welcome back, {first}
      </Text>
      {meta.length > 0 && (
        <Text className="font-nunito-700 mt-[10px] max-w-[280px] text-center text-[15px] leading-[21px] text-ink-muted">
          {meta}
        </Text>
      )}
      {newAura > 0 && (
        <View className="mt-[24px] flex-row items-center gap-[11px] rounded-20 bg-raised px-[17px] py-[15px]">
          <AuraIcon name="aura" size={20} color="#FFC9E4" />
          <Text className="font-nunito-800 text-[13.5px] leading-[19px]" style={{ color: '#FFC9E4' }}>
            +{newAura} aura while you were gone.
          </Text>
        </View>
      )}
      <AuthStatus>Taking you to today's round…</AuthStatus>
    </View>
  );
}

function ToyAvatar({ initial }: { initial: string }) {
  return (
    <ToyShadow depth={4} shadowColor="#C43A7C" backgroundColor="#FF5CA8" radius={9999}>
      <View className="h-[78px] w-[78px] items-center justify-center">
        <Text className="font-fredoka-700 text-[29px] text-white">{initial}</Text>
      </View>
    </ToyShadow>
  );
}
