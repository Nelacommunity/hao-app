import { Appearance, Platform } from 'react-native';
import { useSyncExternalStore } from 'react';

import '@/global.css';
import '@/lib/supabase-storage';

// Light and dark themes. Light is Hao's original warm palette; dark is like WeChat's dark mode. The user
// picks System, Light or Dark in Me (saved on the device). `Colors` and `themed()` style sheets always
// read the active theme, and the root layout redraws the app when it changes.

export type ThemeMode = 'light' | 'dark';
export type ThemePreference = 'system' | ThemeMode;

const Light = {
  red: '#D7263D',
  redDark: '#A3172B',
  redSoft: '#FDE8EA',
  gold: '#F2B33D',
  goldSoft: '#FEF4DE',
  jade: '#1F9D7A',
  jadeSoft: '#E1F4EE',
  ink: '#1B1A1F',
  inkSoft: '#5E5B66',
  muted: '#9A97A3',
  line: '#ECE7E1',
  paper: '#FFF9F3',
  card: '#FFFFFF',
  /** Selected pills and strong buttons, with white text on them. */
  strong: '#1B1A1F',
  /** Text in gold, readable on cards. */
  goldText: '#A26A00',
  /** Error and warning text, readable on redSoft. */
  redText: '#A3172B',
  blueSoft: '#E8F0FF',
  orangeSoft: '#FFF1E6',
  /** Small labels over photos. */
  overlay: 'rgba(255,255,255,0.92)',
  errorBg: '#FFF6F7',
  errorBorder: '#F3C9CF',
};

const Dark: typeof Light = {
  red: '#E5484D',
  redDark: '#C93A40',
  redSoft: '#3B1D21',
  gold: '#F2B33D',
  goldSoft: '#3A2E15',
  jade: '#07C160',
  jadeSoft: '#12301F',
  ink: '#E9E9EB',
  inkSoft: '#A3A3A8',
  muted: '#707075',
  line: '#2A2A2D',
  paper: '#111111',
  card: '#1E1E20',
  strong: '#3A3A3D',
  goldText: '#E0A93A',
  redText: '#FF8A8F',
  blueSoft: '#1C2A44',
  orangeSoft: '#3A2418',
  overlay: 'rgba(17,17,17,0.85)',
  errorBg: '#2A1619',
  errorBorder: '#5A2A30',
};

// ─── The active theme ────────────────────────────────────────────────────────
const KEY = 'hao.theme';
const listeners = new Set<() => void>();

function savedPreference(): ThemePreference {
  try {
    const v = globalThis.localStorage?.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    // Unreadable: follow the system.
  }
  return 'system';
}

let preference = savedPreference();
const resolve = (p: ThemePreference): ThemeMode => (p === 'system' ? (Appearance.getColorScheme() === 'dark' ? 'dark' : 'light') : p);
// On web the first render must match the server-rendered HTML, which can't know the saved theme: React keeps
// mismatched attributes from the server (white buttons with light text). So web starts light, and
// finishThemeHydration() switches to the real theme right after the first render.
let hydrating = Platform.OS === 'web';
let mode: ThemeMode = hydrating ? 'light' : resolve(preference);

function update() {
  if (hydrating) return;
  const next = resolve(preference);
  if (next === mode) return;
  mode = next;
  listeners.forEach((l) => l());
}

Appearance.addChangeListener(() => {
  if (preference === 'system') update();
});

/** Call once after the first render (the root layout does): applies the saved theme on web. */
export function finishThemeHydration() {
  if (!hydrating) return;
  hydrating = false;
  update();
}

export const getThemeMode = () => mode;
export const getThemePreference = () => preference;

export function setThemePreference(next: ThemePreference) {
  preference = next;
  try {
    globalThis.localStorage?.setItem(KEY, next);
  } catch {
    // Kept for this session only.
  }
  update();
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The active theme; components that call it redraw when it changes. */
export const useThemeMode = () => useSyncExternalStore(subscribe, getThemeMode, getThemeMode);
export const useThemePreference = () => useSyncExternalStore(subscribe, getThemePreference, getThemePreference);

/** Picks the value for the active theme. */
export const pick = <T,>(light: T, dark: T): T => (mode === 'dark' ? dark : light);

/** A palette whose values always come from the active theme. */
export function themedPalette<T extends Record<string, unknown>>(light: T, dark: T): T {
  return new Proxy({} as T, {
    get: (_, key) => (mode === 'dark' ? dark : light)[key as keyof T],
    has: (_, key) => key in light,
    ownKeys: () => Reflect.ownKeys(light),
    getOwnPropertyDescriptor: (_, key) => ({ enumerable: true, configurable: true, value: (mode === 'dark' ? dark : light)[key as keyof T] }),
  });
}

/**
 * A style sheet built for the active theme: `themed(() => StyleSheet.create({ … Colors.x … }))`.
 * Built once per theme, on first use.
 */
export function themed<T extends object>(make: () => T): T {
  const built: Partial<Record<ThemeMode, T>> = {};
  const current = () => (built[mode] ??= make());
  return new Proxy({} as T, {
    get: (_, key) => current()[key as keyof T],
    // Array methods (map, forEach…) only visit items that `has` reports.
    has: (_, key) => key in current(),
    ownKeys: () => Reflect.ownKeys(current()),
    getOwnPropertyDescriptor: (_, key) => ({ enumerable: true, configurable: true, value: current()[key as keyof T] }),
  });
}

export const Colors = themedPalette(Light, Dark);

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const Radius = {
  sm: 10,
  md: 16,
  lg: 24,
  pill: 999,
} as const;

export const Shadow = themedPalette(
  { shadowColor: '#3B1A10', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  { shadowColor: '#000000', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 3 }
);
