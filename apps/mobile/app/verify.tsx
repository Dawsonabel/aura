import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSignIn, useSignUp } from '@clerk/expo';
import { callClerk } from '../src/lib/clerkCall';
import { formatUsPhone, toE164 } from '../src/lib/phone';
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

const RESEND_SECONDS = 24;

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
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [secondsLeft]);

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
      setFormError(finalizeMessage);
      return;
    }
    // Back to `/`, which decides between the returning handoff and onboarding.
    router.replace('/');
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
    setSecondsLeft(RESEND_SECONDS);
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
      {secondsLeft > 0 ? (
        <Text className="font-nunito-800 mt-[18px] text-center text-[13.5px] text-ink-muted">
          Didn't get it? Resend in 0:{String(secondsLeft).padStart(2, '0')}
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
