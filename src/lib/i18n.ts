// The app's own text in the traveller's language. English is written in the code (`t('Get started')`);
// other languages are translated once by AI on the server, stored in Supabase for everyone, and kept on
// this device, so a language is never translated twice.
import { useEffect, useSyncExternalStore } from 'react';

import { CATALOG_HASH } from '@shared/i18n/catalog-hash.generated';

import { useTravellerLanguage } from '@/lib/language-store';
import type { Language } from '@/lib/languages';
import { supabase } from '@/lib/supabase';

type Strings = Record<string, string>;
type State = { code: string; strings: Strings; status: 'idle' | 'loading' | 'error' };

let state: State = { code: 'en', strings: {}, status: 'idle' };
const listeners = new Set<() => void>();
const set = (next: State) => {
  state = next;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const cacheKey = (code: string) => `hao.ui.${code}`;

function readCache(code: string): { hash: string; strings: Strings } | null {
  try {
    const raw = globalThis.localStorage?.getItem(cacheKey(code));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(code: string, strings: Strings, complete: boolean) {
  try {
    // An incomplete set is kept for display but fetched again next time.
    globalThis.localStorage?.setItem(cacheKey(code), JSON.stringify({ hash: complete ? CATALOG_HASH : '', strings }));
  } catch {
    // Storage full or unavailable: the server copy still saves AI tokens.
  }
}

const requested = new Set<string>();

/** Switches the app's text to `language`, from the device cache first, then the server. */
export async function loadUiLanguage(language: Language) {
  const { code } = language;
  if (code === 'en') return set({ code, strings: {}, status: 'idle' });
  const cached = readCache(code);
  set({ code, strings: cached?.strings ?? {}, status: cached?.hash === CATALOG_HASH ? 'idle' : 'loading' });
  if (cached?.hash === CATALOG_HASH || requested.has(code)) return;
  requested.add(code);
  try {
    const { data } = await supabase.auth.getSession();
    const params = new URLSearchParams({ lang: code, name: language.name });
    const res = await fetch(`/api/ui-strings?${params}`, {
      headers: data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {},
    });
    const json = (await res.json().catch(() => null)) as { strings?: Strings; complete?: boolean; error?: string } | null;
    if (!res.ok || !json?.strings) throw new Error(json?.error ?? `HTTP ${res.status}`);
    writeCache(code, json.strings, !!json.complete);
    if (state.code === code) set({ code, strings: json.strings, status: 'idle' });
  } catch (e) {
    console.warn('[i18n] could not load', code, e);
    if (state.code === code) set({ ...state, status: 'error' });
  } finally {
    requested.delete(code);
  }
}

/** Fills `{name}` placeholders. */
function fill(text: string, vars?: Record<string, string | number>) {
  return vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : text;
}

/** Translate one of the app's strings (the English text is the key). Unknown strings stay in English. */
export function translate(source: string, vars?: Record<string, string | number>) {
  return fill(state.strings[source] || source, vars);
}

export type T = typeof translate;

/** `t` for components: re-renders when the language or its strings change. */
export function useT(): T {
  const current = useSyncExternalStore(subscribe, () => state, () => state);
  // A fresh function per state, so memoized components (React Compiler) see the change.
  return tFor(current);
}

const tCache = new WeakMap<State, T>();
function tFor(s: State): T {
  let fn = tCache.get(s);
  if (!fn) {
    fn = (source, vars) => fill(s.strings[source] || source, vars);
    tCache.set(s, fn);
  }
  return fn;
}

/** Whether the current language's text is still being translated. */
export function useUiTranslationStatus() {
  return useSyncExternalStore(subscribe, () => state.status, () => state.status);
}

/** Keeps the app's text in sync with the traveller's language. Mount once near the root. */
export function useUiLanguageSync() {
  const language = useTravellerLanguage();
  useEffect(() => {
    void loadUiLanguage(language);
  }, [language]);
}

export { tx } from '@shared/i18n/tx';
