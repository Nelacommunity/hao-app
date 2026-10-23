import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { forwardRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { useT } from '@/lib/i18n';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// Text colours used on the red auth background.
export const OnRed = {
  text: '#FFFFFF',
  soft: 'rgba(255,255,255,0.82)',
  faint: 'rgba(255,255,255,0.6)',
  error: '#FFE08A',
} as const;

export function AuthScreen({
  title,
  subtitle,
  children,
  footer,
  showBack = true,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  showBack?: boolean;
}) {
  const t = useT();
  return (
    <LinearGradient colors={[Colors.red, Colors.redDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Text style={styles.watermark}>好</Text>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <View style={styles.topRow}>
              {showBack && router.canGoBack() ? (
                <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back} accessibilityLabel={t('Go back')}>
                  <Ionicons name="chevron-back" size={22} color="#fff" />
                </Pressable>
              ) : null}
              <View style={styles.brandRow}>
                <View style={styles.logo}>
                  <Text style={styles.logoText}>好</Text>
                </View>
                <Text style={styles.brand}>Hao</Text>
              </View>
            </View>

            <Animated.Text entering={FadeInDown.duration(400)} style={styles.title}>
              {title}
            </Animated.Text>
            {subtitle ? (
              <Animated.Text entering={FadeInDown.duration(400).delay(60)} style={styles.subtitle}>
                {subtitle}
              </Animated.Text>
            ) : null}

            <Animated.View entering={FadeInDown.duration(400).delay(120)} style={styles.body}>
              {children}
            </Animated.View>
            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

export function AuthFooter({ prompt, linkLabel, onPress }: { prompt: string; linkLabel: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" style={({ pressed }) => [styles.footerRow, pressed && { opacity: 0.7 }]}>
      <Text style={styles.footerPrompt}>{prompt}</Text>
      <Text style={styles.footerLink}>{linkLabel}</Text>
    </Pressable>
  );
}

type FieldProps = TextInputProps & {
  label: string;
  icon: IconName;
  error?: string | null;
  secure?: boolean;
};

export const Field = forwardRef<TextInput, FieldProps>(function Field({ label, icon, error, secure, style, ...rest }, ref) {
  const [focused, setFocused] = useState(false);
  const t = useT();
  const [hidden, setHidden] = useState(true);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputWrap, focused && styles.inputFocused, !!error && styles.inputError]}>
        <Ionicons name={icon} size={18} color={focused ? Colors.red : Colors.muted} />
        <TextInput
          ref={ref}
          placeholderTextColor={Colors.muted}
          secureTextEntry={secure && hidden}
          selectionColor={Colors.red}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={[styles.input, style]}
          {...rest}
        />
        {secure ? (
          <Pressable
            onPress={() => setHidden((h) => !h)}
            hitSlop={10}
            accessibilityLabel={hidden ? t('Show password') : t('Hide password')}>
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={Colors.muted} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle" size={14} color={OnRed.error} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
});

export function PrimaryButton({
  label,
  onPress,
  loading,
  disabled,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  const inactive = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      style={({ pressed }) => [styles.primary, inactive && { opacity: 0.6 }, pressed && styles.pressed]}>
      {loading ? (
        <ActivityIndicator color={Colors.red} />
      ) : (
        <>
          <Text style={styles.primaryText}>{label}</Text>
          <Ionicons name="arrow-forward" size={18} color={Colors.red} />
        </>
      )}
    </Pressable>
  );
}

export function TextLink({ label, onPress, muted }: { label: string; onPress: () => void; muted?: boolean }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="link">
      <Text style={[styles.link, muted && { color: OnRed.soft }]}>{label}</Text>
    </Pressable>
  );
}

export function FormMessage({ message, tone = 'error' }: { message: string | null; tone?: 'error' | 'info' }) {
  if (!message) return null;
  const info = tone === 'info';
  return (
    <View style={styles.message}>
      <Ionicons name={info ? 'checkmark-circle' : 'alert-circle'} size={18} color={info ? Colors.jade : Colors.red} />
      <Text style={[styles.messageText, info && { color: Colors.jade }]}>{message}</Text>
    </View>
  );
}

export const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const styles = StyleSheet.create({
  watermark: {
    position: 'absolute',
    right: -60,
    top: '8%',
    fontSize: 300,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.06)',
  },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, height: 56, marginBottom: Spacing.lg },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { fontSize: 20, fontWeight: '900', color: Colors.redDark },
  brand: { fontSize: 20, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  title: { fontSize: 34, lineHeight: 40, fontWeight: '800', color: OnRed.text, letterSpacing: -0.8 },
  subtitle: { fontSize: 16, lineHeight: 23, color: OnRed.soft, marginTop: Spacing.sm },
  body: { marginTop: Spacing.xl, gap: Spacing.md },
  footer: { marginTop: 'auto', paddingTop: Spacing.xl, alignItems: 'center' },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  footerPrompt: { fontSize: 15, color: OnRed.soft },
  footerLink: { fontSize: 15, fontWeight: '800', color: Colors.gold },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '700', color: OnRed.soft, letterSpacing: 0.2 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    height: 54,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  inputFocused: { borderColor: Colors.gold },
  inputError: { borderColor: OnRed.error },
  input: { flex: 1, height: '100%', fontSize: 16, color: Colors.ink },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  errorText: { fontSize: 13, fontWeight: '600', color: OnRed.error },
  primary: {
    flexDirection: 'row',
    gap: Spacing.sm,
    height: 56,
    borderRadius: Radius.pill,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  primaryText: { color: Colors.red, fontSize: 17, fontWeight: '800' },
  pressed: { opacity: 0.88, transform: [{ scale: 0.985 }] },
  link: { fontSize: 15, fontWeight: '700', color: Colors.gold },
  message: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.card,
  },
  messageText: { flex: 1, fontSize: 14, lineHeight: 20, color: Colors.redDark, fontWeight: '600' },
});
