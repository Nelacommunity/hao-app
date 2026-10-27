import { useSyncExternalStore } from 'react';

import '@/lib/supabase-storage';

// Choices made during onboarding, before there is an account: where the user is from and whether to
// share visits anonymously. Sign-up sends them as user metadata and the profile is created with them.
const STORAGE_KEY = 'hao.onboarding';

export type OnboardingChoices = { nationality: string | null; shareVisits: boolean };

function saved(): OnboardingChoices {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw) return { nationality: null, shareVisits: false, ...(JSON.parse(raw) as Partial<OnboardingChoices>) };
  } catch {
    // Start fresh.
  }
  return { nationality: null, shareVisits: false };
}

let current = saved();
const listeners = new Set<() => void>();

export function setOnboardingChoices(changes: Partial<OnboardingChoices>) {
  current = { ...current, ...changes };
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Kept for this session only.
  }
  listeners.forEach((l) => l());
}

export const getOnboardingChoices = () => current;

export function useOnboardingChoices() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => current
  );
}
