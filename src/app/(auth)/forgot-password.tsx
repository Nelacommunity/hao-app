import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { AuthScreen, Field, FormMessage, isEmail, PrimaryButton } from '@/components/auth-ui';
import { supabase } from '@/lib/supabase';
import { useT } from '@/lib/i18n';

export default function ForgotPasswordScreen() {
  const t = useT();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!isEmail(email)) return setError(t('Enter a valid email address.'));
    setLoading(true);
    setError(null);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim());
    setLoading(false);
    if (resetError) return setError(resetError.message);
    router.push({ pathname: '/verify', params: { email: email.trim(), type: 'recovery' } });
  };

  return (
    <AuthScreen title={t('Reset password')} subtitle={t('Enter your email and we’ll send you a code to choose a new password.')}>
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
        returnKeyType="send"
        onSubmitEditing={submit}
        autoFocus
      />
      <PrimaryButton label={t('Send code')} onPress={submit} loading={loading} />
    </AuthScreen>
  );
}
