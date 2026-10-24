import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, type TextInputInstance, View } from 'react-native';

import { AuthScreen, FormMessage, OnRed, PrimaryButton, TextLink } from '@/components/auth-ui';
import { Colors, Radius } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useT } from '@/lib/i18n';

const CODE_LENGTH = 6;
const RESEND_SECONDS = 60;

export default function VerifyScreen() {
  const t = useT();
  const { email = '', type = 'signup' } = useLocalSearchParams<{ email: string; type: 'signup' | 'recovery' }>();
  const { setResettingPassword } = useAuth();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);
  const inputRef = useRef<TextInputInstance>(null);
  const isRecovery = type === 'recovery';

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const verify = async (token: string) => {
    if (token.length !== CODE_LENGTH) return;
    setLoading(true);
    setError(null);
    // Flag the reset before the session appears so the app opens the new-password screen.
    if (isRecovery) setResettingPassword(true);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token,
      type: isRecovery ? 'recovery' : 'email',
    });
    setLoading(false);
    if (verifyError) {
      if (isRecovery) setResettingPassword(false);
      setError(verifyError.code === 'otp_expired' ? t('That code has expired or is incorrect.') : verifyError.message);
      setCode('');
      inputRef.current?.focus();
    }
  };

  const onChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    if (digits.length === CODE_LENGTH) verify(digits);
  };

  const resend = async () => {
    setError(null);
    const { error: resendError } = isRecovery
      ? await supabase.auth.resetPasswordForEmail(email)
      : await supabase.auth.resend({ type: 'signup', email });
    if (resendError) return setError(resendError.message);
    setNotice(t('We sent you a new code.'));
    setCooldown(RESEND_SECONDS);
  };

  return (
    <AuthScreen
      title={isRecovery ? t('Enter reset code') : t('Check your email')}
      subtitle={t('We sent a {digits}-digit code to {email}.', { digits: CODE_LENGTH, email })}>
      <FormMessage message={error} />
      <FormMessage message={notice} tone="info" />

      <Pressable onPress={() => inputRef.current?.focus()} style={styles.boxes} accessibilityLabel={t('Verification code')}>
        {Array.from({ length: CODE_LENGTH }).map((_, i) => {
          const active = i === code.length && !loading;
          return (
            <View key={i} style={[styles.box, active && styles.boxActive, !!code[i] && styles.boxFilled]}>
              <Text style={styles.digit}>{code[i] ?? ''}</Text>
            </View>
          );
        })}
        <TextInput
          ref={inputRef}
          value={code}
          onChangeText={onChange}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={CODE_LENGTH}
          autoFocus
          style={styles.hiddenInput}
        />
      </Pressable>

      <PrimaryButton label={t('Verify')} onPress={() => verify(code)} loading={loading} disabled={code.length !== CODE_LENGTH} />

      <View style={styles.resend}>
        {cooldown > 0 ? (
          <Text style={styles.resendText}>{t('Resend code in {cooldown}s', { cooldown: cooldown })}</Text>
        ) : (
          <TextLink label={t('Resend code')} onPress={resend} />
        )}
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  boxes: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  box: {
    flex: 1,
    aspectRatio: 0.85,
    maxHeight: 64,
    borderRadius: Radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxActive: { borderColor: Colors.gold },
  boxFilled: { backgroundColor: Colors.card },
  digit: { fontSize: 26, fontWeight: '800', color: Colors.ink },
  hiddenInput: { position: 'absolute', width: '100%', height: '100%', opacity: 0 },
  resend: { alignItems: 'center', marginTop: 4 },
  resendText: { fontSize: 14, color: OnRed.faint },
});
