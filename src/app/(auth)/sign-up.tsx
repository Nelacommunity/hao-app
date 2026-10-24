import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, type TextInputInstance, View } from 'react-native';

import { AuthFooter, AuthScreen, Field, FormMessage, isEmail, OnRed, PrimaryButton } from '@/components/auth-ui';
import { LanguagePicker } from '@/components/language-picker';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { setTravellerLanguage, useTravellerLanguage } from '@/lib/language-store';
import { supabase } from '@/lib/supabase';
import { useT } from '@/lib/i18n';

const MIN_PASSWORD = 8;

export default function SignUpScreen() {
  const t = useT();
  const language = useTravellerLanguage();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const emailRef = useRef<TextInputInstance>(null);
  const passwordRef = useRef<TextInputInstance>(null);

  const emailError = touched && !isEmail(email) ? t('Enter a valid email address.') : null;
  const passwordError =
    touched && password.length < MIN_PASSWORD ? t('Use at least {count} characters.', { count: MIN_PASSWORD }) : null;

  const submit = async () => {
    setTouched(true);
    if (!isEmail(email) || password.length < MIN_PASSWORD) return;
    setLoading(true);
    setError(null);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          display_name: name.trim() || null,
          language_code: language.code,
          language_name: language.name,
        },
      },
    });
    setLoading(false);
    if (signUpError) {
      setError(signUpError.code === 'weak_password' ? t('Choose a stronger password.') : signUpError.message);
      return;
    }
    // With email confirmation on, Supabase returns no session until the code is verified.
    if (!data.session) {
      router.push({ pathname: '/verify', params: { email: email.trim(), type: 'signup' } });
    }
  };

  return (
    <AuthScreen
      title={t('Create your account')}
      subtitle={t('Save places, keep your language and use the Hao Agent.')}
      footer={
        <AuthFooter prompt={t('Already have an account?')} linkLabel={t('Sign in')} onPress={() => router.replace('/sign-in')} />
      }>
      <FormMessage message={error} />
      <Field
        label={t('Name')}
        icon="person-outline"
        value={name}
        onChangeText={setName}
        placeholder={t('What should Hao call you?')}
        autoComplete="name"
        textContentType="name"
        returnKeyType="next"
        onSubmitEditing={() => emailRef.current?.focus()}
      />
      <Field
        ref={emailRef}
        label={t('Email')}
        icon="mail-outline"
        value={email}
        onChangeText={setEmail}
        placeholder={t('you@example.com')}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        error={emailError}
      />
      <Field
        ref={passwordRef}
        label={t('Password')}
        icon="lock-closed-outline"
        value={password}
        onChangeText={setPassword}
        placeholder={t('At least {count} characters', { count: MIN_PASSWORD })}
        secure
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={submit}
        error={passwordError}
      />

      <View style={{ gap: 6 }}>
        <Text style={styles.label}>{t('Your language')}</Text>
        <Pressable onPress={() => setPickerOpen(true)} style={({ pressed }) => [styles.language, pressed && { opacity: 0.7 }]}>
          <Text style={{ fontSize: 22 }}>{language.flag}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.languageName}>{language.native}</Text>
            {language.native !== language.name ? <Text style={styles.languageSub}>{language.name}</Text> : null}
          </View>
          <Text style={styles.change}>{t('Change')}</Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.muted} />
        </Pressable>
      </View>

      <PrimaryButton label={t('Create account')} onPress={submit} loading={loading} />
      <Text style={styles.legal}>{t('By continuing you agree to Hao’s Terms and Privacy Policy.')}</Text>

      <LanguagePicker
        visible={pickerOpen}
        selected={language}
        onSelect={setTravellerLanguage}
        onClose={() => setPickerOpen(false)}
      />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '700', color: OnRed.soft, letterSpacing: 0.2 },
  language: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 52,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
  },
  languageName: { fontSize: 16, fontWeight: '700', color: Colors.ink },
  languageSub: { fontSize: 12, color: Colors.muted },
  change: { fontSize: 14, fontWeight: '700', color: Colors.red },
  legal: { fontSize: 12, lineHeight: 17, color: OnRed.faint, textAlign: 'center' },
});
