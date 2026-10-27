import { useSyncExternalStore } from 'react';

import '@/lib/supabase-storage';

// How Discover stories are taken in: read silently, or listened to (Hao reads each page aloud and turns
// the page when it's done). Remembered on the device.
export type StoryMode = 'read' | 'listen';

const STORAGE_KEY = 'hao.discover.mode';

function saved(): StoryMode {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === 'listen' ? 'listen' : 'read';
  } catch {
    return 'read';
  }
}

let current: StoryMode = saved();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setStoryMode(mode: StoryMode) {
  if (mode === current) return;
  current = mode;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, mode);
  } catch {
    // Kept for this session only.
  }
  listeners.forEach((listener) => listener());
}

export function useStoryMode(): [StoryMode, (mode: StoryMode) => void] {
  return [useSyncExternalStore(subscribe, () => current, () => current), setStoryMode];
}
