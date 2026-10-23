import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { tx, useT } from '@/lib/i18n';

const GREETINGS = ['欢迎', 'Welcome', 'Bienvenue', 'ようこそ', 'Bienvenido', '환영합니다'];

const FEATURES = [
  { icon: 'chatbubbles' as const, label: tx('Translate') },
  { icon: 'map' as const, label: tx('Explore') },
  { icon: 'restaurant' as const, label: tx('Eat') },
];

export default function LandingScreen() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [greeting, setGreeting] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setGreeting((g) => (g + 1) % GREETINGS.length), 1800);
    return () => clearInterval(id);
  }, []);

  return (
    <LinearGradient
      colors={[Colors.red, Colors.redDark]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.container, { paddingTop: insets.top + Spacing.md, paddingBottom: insets.bottom + Spacing.lg }]}>
      <StatusBar style="light" />
      <Text style={styles.watermark}>好</Text>

      <View style={styles.brandRow}>
        <View style={styles.logo}>
          <Text style={styles.logoText}>好</Text>
        </View>
        <Text style={styles.brand}>Hao</Text>
      </View>

      <View style={styles.middle}>
        <View style={styles.greetingBox}>
          <Animated.Text
            key={greeting}
            entering={FadeIn.duration(400)}
            exiting={FadeOut.duration(300)}
            style={styles.greeting}>
            {GREETINGS[greeting]}
          </Animated.Text>
        </View>
        <Animated.Text entering={FadeInDown.delay(100)} style={styles.headline}>{t('China,{br}made easy.', { br: '\n' })}</Animated.Text>
        <Animated.Text entering={FadeInDown.delay(200)} style={styles.subhead}>{t('Translate, explore and eat like a local.')}</Animated.Text>

        <Animated.View entering={FadeInDown.delay(300)} style={styles.features}>
          {FEATURES.map((f) => (
            <View key={f.label} style={styles.feature}>
              <View style={styles.featureIcon}>
                <Ionicons name={f.icon} size={26} color={Colors.gold} />
              </View>
              <Text style={styles.featureLabel}>{t(f.label)}</Text>
            </View>
          ))}
        </Animated.View>
      </View>

      <Animated.View entering={FadeInDown.delay(400)} style={styles.actions}>
        <Pressable
          onPress={() => router.push('/onboarding')}
          accessibilityRole="button"
          style={({ pressed }) => [styles.button, styles.primaryBtn, pressed && styles.pressed]}>
          <Text style={styles.primaryText}>{t('Get started')}</Text>
          <Ionicons name="arrow-forward" size={18} color={Colors.red} />
        </Pressable>
        <Pressable
          onPress={() => router.push('/sign-in')}
          accessibilityRole="button"
          style={({ pressed }) => [styles.button, styles.secondaryBtn, pressed && styles.pressed]}>
          <Text style={styles.secondaryText}>{t('I already have an account')}</Text>
        </Pressable>
      </Animated.View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    overflow: 'hidden',
  },
  watermark: {
    position: 'absolute',
    right: -50,
    top: '22%',
    fontSize: 340,
    color: 'rgba(255,255,255,0.07)',
    fontWeight: '900',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { fontSize: 22, fontWeight: '900', color: Colors.redDark },
  brand: { fontSize: 24, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  middle: { flex: 1, justifyContent: 'center' },
  greetingBox: { height: 44, justifyContent: 'center' },
  greeting: { fontSize: 30, fontWeight: '700', color: Colors.gold },
  headline: {
    fontSize: 48,
    lineHeight: 54,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -1,
    marginTop: Spacing.sm,
  },
  subhead: {
    fontSize: 17,
    lineHeight: 24,
    color: 'rgba(255,255,255,0.85)',
    marginTop: Spacing.md,
  },
  features: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.xl },
  feature: { alignItems: 'center', gap: Spacing.sm },
  featureIcon: {
    width: 60,
    height: 60,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureLabel: { fontSize: 13, fontWeight: '700', color: '#fff' },
  actions: { gap: Spacing.sm + 4 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    height: 56,
    borderRadius: Radius.pill,
  },
  primaryBtn: { backgroundColor: '#fff' },
  primaryText: { fontSize: 17, fontWeight: '800', color: Colors.red },
  secondaryBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  secondaryText: { fontSize: 17, fontWeight: '700', color: '#fff' },
  pressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },
});
