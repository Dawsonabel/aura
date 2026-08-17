import { useEffect } from 'react';
import { Link, useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { Show } from '@clerk/expo';
import { useMe } from '../src/hooks/useMe';

export default function Home() {
  return (
    <View className="flex-1 items-center justify-center gap-4 p-8">
      <Text className="text-2xl font-semibold">Aura</Text>
      <Show when="signed-out">
        <Link href="/sign-in" className="underline">
          Sign in
        </Link>
      </Show>
      <Show when="signed-in">
        <SignedInGate />
      </Show>
    </View>
  );
}

// Signed in has nothing to show at `/` itself — just routes on to wherever the user actually
// belongs. Matches apps/web's index.tsx SignedInGate.
function SignedInGate() {
  const { data } = useMe();
  const router = useRouter();

  useEffect(() => {
    if (data) router.replace(data.onboarded === false ? '/onboarding' : '/aura');
  }, [data, router]);

  return <Text>Loading…</Text>;
}
