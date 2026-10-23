import { useSyncExternalStore } from 'react';

import '@/lib/supabase-storage';

// Hearts on Discover cards that aren't places (dishes, culture, festivals), remembered on this device.
// Places use saved places in Supabase instead, so they show up in the profile.
const KEY = 'hao.likes';

function load(): Set<string> {
  try {
    return new Set(JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

let likes = load();
const listeners = new Set<() => void>();

export function toggleLike(id: string) {
  likes = new Set(likes);
  if (likes.has(id)) likes.delete(id);
  else likes.add(id);
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify([...likes]));
  } catch {
    // Kept for this session only.
  }
  listeners.forEach((l) => l());
}

export function useLikes() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => likes,
    () => likes
  );
}
