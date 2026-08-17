import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSignUp } from '@clerk/expo';

export default function SignUpScreen() {
  const { signUp } = useSignUp();
  const router = useRouter();
  const [step, setStep] = useState<'form' | 'code'>('form');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  async function submitForm() {
    setFormError(null);
    const { error } = await signUp.password({ phoneNumber, password });
    if (error) {
      setFormError(error.longMessage ?? error.message);
      return;
    }
    if (signUp.protectCheck) {
      setFormError(
        'This account can’t verify it’s not a bot from the app yet — enable Native API for this app in the Clerk dashboard (Native API page) to allow native sign-ups.'
      );
      return;
    }
    const { error: sendError } = await signUp.verifications.sendPhoneCode();
    if (sendError) {
      setFormError(sendError.longMessage ?? sendError.message);
      return;
    }
    setStep('code');
  }

  async function verifyCode() {
    setFormError(null);
    const { error: verifyError } = await signUp.verifications.verifyPhoneCode({ code });
    if (verifyError) {
      setFormError(verifyError.longMessage ?? verifyError.message);
      return;
    }
    const { error: finalizeError } = await signUp.finalize();
    if (finalizeError) {
      setFormError(finalizeError.longMessage ?? finalizeError.message);
      return;
    }
    router.replace('/');
  }

  return (
    <View className="flex-1 items-center justify-center gap-4 p-8">
      <Text className="text-2xl font-semibold">Sign up</Text>
      {step === 'form' ? (
        <>
          <TextInput
            className="w-full rounded border border-gray-300 p-3"
            placeholder="Phone number"
            keyboardType="phone-pad"
            autoComplete="tel"
            value={phoneNumber}
            onChangeText={setPhoneNumber}
          />
          <TextInput
            className="w-full rounded border border-gray-300 p-3"
            placeholder="Password"
            secureTextEntry
            autoComplete="password-new"
            value={password}
            onChangeText={setPassword}
          />
          <Pressable className="rounded bg-black px-4 py-3" onPress={submitForm}>
            <Text className="text-white">Continue</Text>
          </Pressable>
        </>
      ) : (
        <>
          <TextInput
            className="w-full rounded border border-gray-300 p-3"
            placeholder="Code"
            keyboardType="number-pad"
            value={code}
            onChangeText={setCode}
          />
          <Pressable className="rounded bg-black px-4 py-3" onPress={verifyCode}>
            <Text className="text-white">Verify</Text>
          </Pressable>
        </>
      )}
      {formError ? <Text className="text-red-600">{formError}</Text> : null}
    </View>
  );
}
