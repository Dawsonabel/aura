import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useIsFocused, useRouter } from 'expo-router';
import { Show, useAuth, useClerk, useSignIn, useSignUp } from '@clerk/expo';
import { useMe } from '../src/hooks/useMe';
import { useFlames } from '../src/hooks/useFlames';
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
  PhoneField,
  PromptPill
} from '../src/components/authKit';
import { ToyShadow } from '../src/components/ToyShadow';
import { LoadingGate } from '../src/components/LoadingScreen';

const SAMPLE_PROMPTS = [
  { emoji: '🥵', label: 'Hottest in 11th' },
  { emoji: '💅', label: 'Best dressed' },
  { emoji: '🎤', label: 'Will go viral next' },
  { emoji: '😏', label: 'Biggest flirt' }
];

export default function Home() {
  const { isLoaded } = useAuth();
  /* Same query key as SignedInGate's own useMe, so this is a second observer rather than a second
     request. Signed out it can't report loading: the hook is `enabled: isSignedIn === true`, and a
     disabled query is pending-but-not-fetching, which React Query reports as isLoading false. */
  const { isLoading: meLoading } = useMe();

  // 9A: the breathing wordmark covers exactly the two waits it names — the session resolving
  // (Clerk's isLoaded) and `me` fetching. Neither <Show> renders while Clerk is still deciding,
  // so without this the app opened on an empty ground-coloured screen.
  return (
    <LoadingGate loading={!isLoaded || meLoading}>
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
      <AuthBrand centered />
      <AuthHero
        badge="YOUR SCHOOL ONLY"
        title="Find out who's picking you."
        body="Vote on your class. See how many people picked you back. They never find out it was you."
      />
      <View className="mt-[18px] flex-row flex-wrap gap-[9px]">
        {SAMPLE_PROMPTS.map(p => (
          <PromptPill key={p.label} emoji={p.emoji} label={p.label} />
        ))}
      </View>

      <View className="mt-auto gap-3 pt-6">
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
        <Text className="font-nunito-800 text-center text-[12.5px] leading-[18px] text-ink-faint">
          New or coming back — same button. Standard rates apply.
        </Text>
      </View>
    </>
  );
}

/* Signed in: route on to wherever the user belongs. Onboarded users get the returning handoff
   first (it's the design's landing beat, not a spinner); everyone else goes to onboarding. */
function SignedInGate() {
  const { data, isError } = useMe();
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

  // A valid session pointing at an account the app can't load is otherwise a dead end — there's
  // no other sign-out entry point until Profile is built.
  if (isError) {
    return (
      <View className="mt-auto items-center gap-3 pt-6">
        <Text className="font-nunito-800 text-center text-[13.5px] text-ink-muted">Could not load your account.</Text>
        <AuthButton label="Sign out" onPress={() => signOut()} disabled={false} />
      </View>
    );
  }

  if (data && data.onboarded !== false) {
    return <ReturningHandoff name={data.firstName} grade={data.grade} school={data.school?.name ?? null} />;
  }

  return (
    <View className="mt-auto items-center gap-3 pt-6">
      <Text className="font-nunito-800 text-[13.5px] text-ink-muted">Loading…</Text>
      <AuthFooterLink action="Sign out" onPress={() => signOut()} />
    </View>
  );
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
  const { data: flames } = useFlames();
  const newFlames = flames?.flames.filter(f => f.unread).length ?? 0;
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
      {newFlames > 0 && (
        <View className="mt-[24px] flex-row items-center gap-[11px] rounded-20 bg-raised px-[17px] py-[15px]">
          <Text style={{ fontSize: 19 }}>🔥</Text>
          <Text className="font-nunito-800 text-[13.5px] leading-[19px]" style={{ color: '#FFC9E4' }}>
            {newFlames} new {newFlames === 1 ? 'flame' : 'flames'} while you were gone.
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
