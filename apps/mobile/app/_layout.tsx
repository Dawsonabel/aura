import '../global.css';
import { View } from 'react-native';
import { useFonts } from 'expo-font';
import { Fredoka_500Medium, Fredoka_600SemiBold, Fredoka_700Bold } from '@expo-google-fonts/fredoka';
import { Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black } from '@expo-google-fonts/nunito';
import { ClerkProvider } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { queryClient } from '../src/lib/queryClient';
import { configureNotificationHandler } from '../src/lib/push';

/* Module scope, not an Effect: this registers a handler with expo-notifications rather than doing
   anything per-render, and it has to be in place before any notification can arrive. */
configureNotificationHandler();

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY as string;

export default function RootLayout() {
  // Each weight is its own RN "font family" — custom TTF fonts don't respond to a separate
  // fontWeight style on Android, so every weight the design uses gets loaded and referenced by
  // its own name (see the fredoka-*/nunito-* entries in tailwind.config.js).
  const [fontsLoaded] = useFonts({
    Fredoka_500Medium,
    Fredoka_600SemiBold,
    Fredoka_700Bold,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
    Nunito_900Black
  });

  if (!fontsLoaded) return <View className="flex-1 bg-ground" />;

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <QueryClientProvider client={queryClient}>
        <Stack screenOptions={{ headerShown: false }} />
      </QueryClientProvider>
    </ClerkProvider>
  );
}
