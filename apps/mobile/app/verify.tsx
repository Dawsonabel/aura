import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSignIn, useSignUp } from '@clerk/expo';
import { callClerk } from '../src/lib/clerkCall';
import { formatUsPhone, toE164 } from '../src/lib/phone';
import { CODE_COOLDOWN_SECONDS, useCooldown } from '../src/hooks/useCooldown';
import {
  AuthBack,
  AuthButton,
  AuthError,
  AuthFooter,
  AuthFooterLink,
  AuthHeading,
  AuthShell,
  OtpField
} from '../src/components/authKit';

/* The design shows "Resend in 0:24", but that's a mid-countdown snapshot rather than a start
   value. The real interval is Clerk's own per-number window — see CODE_COOLDOWN_SECONDS, which
   matches the wording of the server's rejection ("wait at least 30 seconds"). */

/* One code screen for both branches — per 5A, "the same code screen; the number tells us which
   they are". `mode` only decides which Clerk resource to verify against; the UI is identical. */
export default function VerifyScreen() {
  const { phone = '', mode = 'signIn' } = useLocalSearchParams<{ phone: string; mode: string }>();
  const isSignUp = mode === 'signUp';
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const router = useRouter();

  const [code, setCode] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Shared with the welcome screen — same Clerk window, same wall-clock behaviour.
  const cooldown = useCooldown();

  // A code was just sent to get here, so the window is already open on arrival.
  useEffect(() => {
    cooldown.start(CODE_COOLDOWN_SECONDS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function verify() {
    setFormError(null);
    setBusy(true);

    const verifyMessage = isSignUp
      ? await callClerk(() => signUp.verifications.verifyPhoneCode({ code }))
      : await callClerk(() => signIn.phoneCode.verifyCode({ code }));
    if (verifyMessage) {
      setBusy(false);
      setFormError(verifyMessage);
      return;
    }

    const finalizeMessage = isSignUp
      ? await callClerk(() => signUp.finalize())
      : await callClerk(() => signIn.finalize());
    setBusy(false);
    if (finalizeMessage) {
      /* Clerk's wording here ("Cannot finalize sign-up without a created session") describes the
         symptom, not the cause. Checked against this instance's /v1/environment: phone_number is
         the ONLY required attribute and password is not enabled, so nothing is actually missing —
         what blocks the session is `captcha_enabled: true` (smart/Turnstile). @clerk/expo ships no
         native CAPTCHA widget, so the challenge can never be satisfied from the app.

         If `missingFields` is ever non-empty the instance really did gain a new requirement, so
         report that; otherwise name the bot-protection cause rather than echoing the symptom. */
      const missing = isSignUp ? (signUp.missingFields as string[] | undefined) : undefined;
      if (missing?.length) {
        setFormError(`Your number is verified, but this account still needs: ${missing.join(', ')}.`);
        return;
      }
      if (isSignUp) {
        setFormError(
          'Your number is verified, but sign-up can’t complete: this Clerk instance has bot protection on, ' +
            'and there’s no native CAPTCHA for it to run. Turn off Bot sign-up protection (or enable Native API) ' +
            'in the Clerk dashboard.'
        );
        return;
      }
      setFormError(finalizeMessage);
      return;
    }
    /* Back to `/`, which decides between the returning handoff and onboarding. `dismissTo` rather
       than `replace`: replace() swaps only the top route, so `/` (still sitting at the bottom of
       the stack, since this screen was pushed on top of it) ended up in the stack twice — one
       stale copy of it left mounted and re-issuing redirects for the rest of the session.
       `dismissTo` pops back to the existing screen instead, and falls back to replacing when
       there's no `/` below (a cold-start deep link straight into this route). */
    router.dismissTo('/');
  }

  async function resend() {
    setFormError(null);
    setCode('');
    const message = isSignUp
      ? await callClerk(() => signUp.verifications.sendPhoneCode())
      : await callClerk(() => signIn.phoneCode.sendCode({ phoneNumber: toE164(phone) }));
    if (message) {
      setFormError(message);
      return;
    }
    // Setting a new deadline is what restarts the countdown — the Effect above keys off it.
    // Only on success: a failed resend didn't send a code, so it shouldn't lock the button out.
    cooldown.start(CODE_COOLDOWN_SECONDS);
  }

  return (
    <AuthShell>
      <AuthBack onPress={() => router.back()} />
      <AuthHeading
        marginTop={14}
        title="Check your texts"
        subtitle={
          <>
            6-digit code sent to <Text className="font-nunito-800 text-white">{formatUsPhone(phone)}</Text>.
          </>
        }
      />
      <OtpField value={code} onChangeText={setCode} error={formError !== null} />
      <AuthError message={formError} />
      {cooldown.active ? (
        <Text className="font-nunito-800 mt-[18px] text-center text-[13.5px] text-ink-muted">
          Didn't get it? Resend in {cooldown.label}
        </Text>
      ) : (
        <AuthFooterLink action="Didn't get it? Send a new code" onPress={resend} />
      )}
      <AuthFooter>
        <AuthButton label={busy ? 'Verifying…' : 'Verify'} onPress={verify} disabled={code.length < 6 || busy} />
        <AuthFooterLink action="Wrong number? Go back" onPress={() => router.back()} />
      </AuthFooter>
    </AuthShell>
  );
}
