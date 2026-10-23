import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { TranslatingBanner } from '@/components/translating-banner';
import { Colors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/lib/auth';
import { useUiLanguageSync } from '@/lib/i18n';

SplashScreen.preventAutoHideAsync();

const HaoTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: Colors.red,
    background: Colors.paper,
    card: Colors.card,
    text: Colors.ink,
    border: Colors.line,
  },
};

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={HaoTheme}>
        <AuthProvider>
          <StatusBar style="dark" />
          <RootNavigator />
          <TranslatingBanner />
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const { session, loading, resettingPassword } = useAuth();
  const signedIn = !!session;
  useUiLanguageSync();

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  // Keep the splash screen up until the stored session has been read.
  if (loading) return null;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.paper } }}>
      <Stack.Protected guard={signedIn && !resettingPassword}>
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        <Stack.Screen name="place/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="room" />
        <Stack.Screen name="memories" />
      </Stack.Protected>

      <Stack.Protected guard={signedIn && resettingPassword}>
        <Stack.Screen name="update-password" options={{ gestureEnabled: false }} />
      </Stack.Protected>

      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}
