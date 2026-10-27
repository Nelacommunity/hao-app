import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { Profile } from '@/lib/database.types';
import { setTravellerLanguage, useTravellerLanguage } from '@/lib/language-store';
import { customLanguage, Languages, type Language } from '@/lib/languages';
import { supabase } from '@/lib/supabase';

type AuthContextValue = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  /** True between verifying a password-reset code and choosing the new password. */
  resettingPassword: boolean;
  setResettingPassword: (value: boolean) => void;
  updateProfile: (
    changes: Partial<
      Pick<
        Profile,
        'display_name' | 'language_code' | 'language_name' | 'preferences' | 'memory_enabled' | 'nationality' | 'home_city' | 'university' | 'city' | 'share_visits' | 'traveller_type' | 'loves' | 'wants' | 'twin_completed_at' | 'contact_phone' | 'contact_email'
      >
    >
  ) => Promise<void>;
  signOut: () => Promise<void>;
  /** Reloads the profile after the server changed it (e.g. the twin chat). */
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function languageFromProfile(profile: Pick<Profile, 'language_code' | 'language_name'>): Language {
  return Languages.find((l) => l.code === profile.language_code) ?? customLanguage(profile.language_name);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [resettingPassword, setResettingPassword] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (cancelled || !data) return;
        setProfile(data);
        setTravellerLanguage(languageFromProfile(data));
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const updateProfile = useCallback<AuthContextValue['updateProfile']>(
    async (changes) => {
      if (!userId) return;
      const { data, error } = await supabase.from('profiles').update(changes).eq('id', userId).select().single();
      if (error) throw error;
      setProfile(data);
    },
    [userId]
  );

  const refreshProfile = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (data) setProfile(data);
  }, [userId]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const value = useMemo(
    () => ({
      session,
      profile: session ? profile : null,
      loading,
      resettingPassword,
      setResettingPassword,
      updateProfile,
      signOut,
      refreshProfile,
    }),
    [session, profile, loading, resettingPassword, updateProfile, signOut, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** The traveller's language, saved to their profile when signed in. */
export function useLanguagePreference() {
  const language = useTravellerLanguage();
  const { session, updateProfile } = useAuth();

  const setLanguage = useCallback(
    (next: Language) => {
      setTravellerLanguage(next);
      if (session) {
        updateProfile({ language_code: next.code, language_name: next.name }).catch(() => {});
      }
    },
    [session, updateProfile]
  );

  return [language, setLanguage] as const;
}
