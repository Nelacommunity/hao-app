import { useState } from 'react';

import { AuthScreen, Field, FormMessage, PrimaryButton } from '@/components/auth-ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useT } from '@/lib/i18n';

const MIN_PASSWORD = 8;

export default function UpdatePasswordScreen() {
  const t = useT();
  const { setResettingPassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (password.length < MIN_PASSWORD) return setError(t('Use at least {count} characters.', { count: MIN_PASSWORD }));
    if (password !== confirm) return setError(t('Passwords don’t match.'));
    setLoading(true);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) {
      return setError(updateError.code === 'same_password' ? t('Choose a password you haven’t used before.') : updateError.message);
    }
    setResettingPassword(false);
  };

  return (
    <AuthScreen title={t('Choose a new password')} subtitle={t('You’re verified. Set a new password to finish.')} showBack={false}>
      <FormMessage message={error} />
      <Field
        label={t('New password')}
        icon="lock-closed-outline"
        value={password}
        onChangeText={setPassword}
        placeholder={t('At least {count} characters', { count: MIN_PASSWORD })}
        secure
        autoComplete="new-password"
        textContentType="newPassword"
        autoFocus
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
