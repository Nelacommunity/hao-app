import { useSyncExternalStore } from 'react';

import { customLanguage, DefaultLanguage, Languages, type Language } from '@/lib/languages';
import '@/lib/supabase-storage';

// App-wide traveller language, shared by onboarding, the agent and the app's text (src/lib/i18n.ts).
// Remembered on the device so the app opens in the same language, even before sign-in.
const STORAGE_KEY = 'hao.language';

function saved(): Language {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return DefaultLanguage;
    const { code, name } = JSON.parse(raw) as { code: string; name: string };
    return Languages.find((l) => l.code === code) ?? customLanguage(name);
  } catch {
    return DefaultLanguage;
  }
}

let current: Language = saved();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setTravellerLanguage(language: Language) {
  if (language.code === current.code) return;
  current = language;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify({ code: language.code, name: language.name }));
  } catch {
    // Not remembered; the profile still keeps it for signed-in users.
  }
  listeners.forEach((listener) => listener());
}

export function useTravellerLanguage() {
  return useSyncExternalStore(subscribe, () => current, () => current);
}
