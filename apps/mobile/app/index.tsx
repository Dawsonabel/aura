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
        <MeProof />
      </Show>
    </View>
  );
}

function MeProof() {
  const { data, isLoading, isError } = useMe();
  const router = useRouter();

  useEffect(() => {
    if (data && data.onboarded === false) router.replace('/onboarding');
  }, [data, router]);

  if (isLoading) return <Text>Loading…</Text>;
  if (isError || !data) return <Text>Could not load account.</Text>;
  if (data.onboarded === false) return <Text>Loading…</Text>;

  return (
    <View className="items-center gap-1">
      <Text>id: {data.id}</Text>
      <Text>coins: {data.coins}</Text>
      <Text>onboarded: {String(data.onboarded)}</Text>
    </View>
  );
}
