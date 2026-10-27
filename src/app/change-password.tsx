import { router } from 'expo-router';
import { useState } from 'react';

import { AuthScreen, Field, FormMessage, PrimaryButton } from '@/components/auth-ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useT } from '@/lib/i18n';

const MIN_PASSWORD = 8;

/** Profile → Change password, for a signed-in user who knows their current password. */
export default function ChangePasswordScreen() {
  const t = useT();
  const { session } = useAuth();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    const email = session?.user.email;
    if (!email) return;
    if (!current) return setError(t('Enter your current password.'));
    if (password.length < MIN_PASSWORD) return setError(t('Use at least {count} characters.', { count: MIN_PASSWORD }));
    if (password !== confirm) return setError(t('Passwords don’t match.'));
    setLoading(true);
    setError(null);
    // Supabase doesn't ask for the old password, so check it first: a borrowed, unlocked phone can't change it.
    const { error: checkError } = await supabase.auth.signInWithPassword({ email, password: current });
    if (checkError) {
      setLoading(false);
      return setError(checkError.code === 'invalid_credentials' ? t('Your current password is wrong.') : checkError.message);
    }
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) {
      return setError(updateError.code === 'same_password' ? t('Choose a password you haven’t used before.') : updateError.message);
    }
    setDone(true);
    setTimeout(() => router.back(), 900);
  };

  return (
    <AuthScreen title={t('Change password')} subtitle={t('Enter your current password, then choose a new one.')}>
      <FormMessage message={error} />
      <FormMessage message={done ? t('Password changed.') : null} tone="info" />
      <Field
        label={t('Current password')}
        icon="lock-closed-outline"
        value={current}
        onChangeText={setCurrent}
        placeholder={t('Your password')}
        secure
        autoComplete="current-password"
        textContentType="password"
        autoFocus
      />
      <Field
        label={t('New password')}
        icon="lock-closed-outline"
        value={password}
        onChangeText={setPassword}
        placeholder={t('At least {count} characters', { count: MIN_PASSWORD })}
        secure
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <Field
        label={t('Confirm password')}
        icon="lock-closed-outline"
        value={confirm}
        onChangeText={setConfirm}
        placeholder={t('Type it again')}
        secure
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <PrimaryButton label={t('Save password')} onPress={submit} loading={loading} />
    </AuthScreen>
  );
}
