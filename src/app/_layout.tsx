import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { TranslatingBanner } from '@/components/translating-banner';
import { Colors, finishThemeHydration, useThemeMode } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/lib/auth';
import { useUiLanguageSync } from '@/lib/i18n';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // Light or dark (Me → Appearance, or the system). Screens read Colors while rendering, so the app
  // below is drawn again for the new theme (the key); navigation state lives above it and is kept.
  const mode = useThemeMode();
  useEffect(finishThemeHydration, []);
  const theme = useMemo(() => {
    const base = mode === 'dark' ? DarkTheme : DefaultTheme;
    return { ...base, colors: { ...base.colors, primary: Colors.red, background: Colors.paper, card: Colors.card, text: Colors.ink, border: Colors.line } };
  }, [mode]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ThemeProvider value={theme}>
        <AuthProvider>
          <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
          <RootNavigator key={mode} />
          <TranslatingBanner key={`banner-${mode}`} />
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
        <Stack.Screen name="admin-stories" />
        <Stack.Screen name="twin" options={{ presentation: 'modal' }} />
      </Stack.Protected>

      <Stack.Protected guard={signedIn && resettingPassword}>
        <Stack.Screen name="update-password" options={{ gestureEnabled: false }} />
      </Stack.Protected>

      {/* (tabs) has no index route, so name where a signed-in user lands instead of `/`. */}
      <Stack.Protected guard={!signedIn} redirectTo={resettingPassword ? '/update-password' : '/translate'}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}
