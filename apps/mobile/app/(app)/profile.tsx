import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

/* Screen 6 in the original handoff — not built yet. The ⚙️ is live, though: Settings is the one
   place sign-out and delete-account exist, and delete-account is an App Store requirement, so it
   needed a real entry point rather than waiting for the rest of Profile. */
export default function Profile() {
  const router = useRouter();
  return (
    <View className="flex-1 bg-ground px-[21px] pt-3">
      <View className="flex-row items-center justify-end">
        <Pressable onPress={() => router.push('/settings')} hitSlop={12}>
          <Text style={{ fontSize: 20 }}>⚙️</Text>
        </Pressable>
      </View>
      <View className="flex-1 items-center justify-center">
        <Text className="font-nunito-800 text-[15px] text-ink-muted">Coming soon.</Text>
      </View>
    </View>
  );
}
