import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { TextInput, View } from 'react-native';

import { AuthFooter, AuthScreen, Field, FormMessage, isEmail, PrimaryButton, TextLink } from '@/components/auth-ui';
import { supabase } from '@/lib/supabase';
import { useT } from '@/lib/i18n';

export default function SignInScreen() {
  const t = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);

  const submit = async () => {
    if (!isEmail(email)) return setError(t('Enter a valid email address.'));
    if (!password) return setError(t('Enter your password.'));
    setLoading(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (!signInError) return; // The root layout switches to the app once the session exists.

    if (signInError.code === 'email_not_confirmed') {
      await supabase.auth.resend({ type: 'signup', email: email.trim() });
      router.push({ pathname: '/verify', params: { email: email.trim(), type: 'signup' } });
      return;
    }
    setError(signInError.code === 'invalid_credentials' ? t('Wrong email or password.') : signInError.message);
  };

  return (
    <AuthScreen
      title={t('Welcome back')}
      subtitle={t('Sign in to continue your trip.')}
      footer={
        <AuthFooter prompt={t('New to Hao?')} linkLabel={t('Create an account')} onPress={() => router.replace('/sign-up')} />
      }>
      <FormMessage message={error} />
      <Field
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
      />
      <Field
        ref={passwordRef}
        label={t('Password')}
        icon="lock-closed-outline"
        value={password}
        onChangeText={setPassword}
        placeholder={t('Your password')}
        secure
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <View style={{ alignItems: 'flex-end' }}>
        <TextLink label={t('Forgot password?')} onPress={() => router.push({ pathname: '/forgot-password', params: { email } })} />
      </View>
      <PrimaryButton label={t('Sign in')} onPress={submit} loading={loading} />
    </AuthScreen>
  );
}
