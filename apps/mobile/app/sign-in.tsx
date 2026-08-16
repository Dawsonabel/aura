import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSignIn } from '@clerk/expo';

export default function SignInScreen() {
  const { signIn } = useSignIn();
  const router = useRouter();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [code, setCode] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  async function sendCode() {
    setFormError(null);
    const { error } = await signIn.phoneCode.sendCode({ phoneNumber });
    if (error) {
      setFormError(error.longMessage ?? error.message);
      return;
    }
    setStep('code');
  }

  async function verifyCode() {
    setFormError(null);
    const { error: verifyError } = await signIn.phoneCode.verifyCode({ code });
    if (verifyError) {
      setFormError(verifyError.longMessage ?? verifyError.message);
      return;
    }
    const { error: finalizeError } = await signIn.finalize();
    if (finalizeError) {
      setFormError(finalizeError.longMessage ?? finalizeError.message);
      return;
    }
    router.replace('/');
  }

  return (
    <View className="flex-1 items-center justify-center gap-4 p-8">
      <Text className="text-2xl font-semibold">Sign in</Text>
      {step === 'phone' ? (
        <>
          <TextInput
            className="w-full rounded border border-gray-300 p-3"
            placeholder="Phone number"
            keyboardType="phone-pad"
            autoComplete="tel"
            value={phoneNumber}
            onChangeText={setPhoneNumber}
          />
          <Pressable className="rounded bg-black px-4 py-3" onPress={sendCode}>
            <Text className="text-white">Send code</Text>
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
