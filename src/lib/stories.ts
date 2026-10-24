// Discover stories in the app: today's set (cached on the device for offline viewing), what the user does
// with each story (logged to story_events in batches, not one request per swipe), save, hide and mute.
import { Image } from 'expo-image';
import { AppState } from 'react-native';

import type { Story } from '@shared/stories/schema';

import '@/lib/supabase-storage';
import { supabase } from '@/lib/supabase';

export type { Story };
export type StoryEvent = 'view' | 'complete' | 'skip' | 'save' | 'action_tap' | 'ask_more' | 'hide';
export type DiscoverFeed = { day: string; city: string; stories: Story[] };

const FEED_KEY = 'hao.discover.feed';
const QUEUE_KEY = 'hao.discover.events';
const CHINA_OFFSET_MS = 8 * 3_600_000;

/** Today in China, YYYY-MM-DD: the feed changes at midnight Beijing time wherever the phone is set. */
export const chinaDay = (now = new Date()) => new Date(now.getTime() + CHINA_OFFSET_MS).toISOString().slice(0, 10);

function read<T>(key: string): T | null {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // Kept in memory only.
  }
}

/** Today's feed from the device, if it was already loaded today. */
export function cachedFeed(): DiscoverFeed | null {
  const feed = read<DiscoverFeed>(FEED_KEY);
  return feed?.day === chinaDay() ? feed : null;
}

/**
 * Today's set: from the device when already loaded today (so it doesn't reshuffle while swiping), else from
 * the server. Offline, the last set the device has is shown, even if it is from an earlier day.
 */
export async function loadFeed(o: { language: string; location: { latitude: number; longitude: number } | null; refresh?: boolean }) {
  const cached = cachedFeed();
  if (cached && !o.refresh) return { feed: cached, offline: false };
  try {
    const { data } = await supabase.auth.getSession();
    const res = await fetch('/api/discover-feed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
      body: JSON.stringify({ language: o.language, location: o.location ? { lat: o.location.latitude, lng: o.location.longitude } : null }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body) throw new Error(body?.error ?? `Discover could not load (${res.status})`);
    write(FEED_KEY, body);
    return { feed: body as DiscoverFeed, offline: false };
  } catch (e) {
    const old = read<DiscoverFeed>(FEED_KEY);
    if (old) return { feed: old, offline: true };
    throw e;
  }
}

/** Starts downloading the images of these stories so they show at once when swiped to. */
export function preloadImages(stories: Story[]) {
  const urls = stories.flatMap((s) => s.slides.map((slide) => slide.image_url)).filter((u): u is string => !!u);
  if (urls.length) Image.prefetch(urls, 'disk').catch(() => {});
}

// ─── Events, in batches ──────────────────────────────────────────────────────
type QueuedEvent = { story_id: string; event: StoryEvent; slide_index: number | null; dwell_ms: number | null; created_at: string };

let queue: QueuedEvent[] = read<QueuedEvent[]>(QUEUE_KEY) ?? [];
let timer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;
const FLUSH_AFTER_MS = 15_000;
const FLUSH_AT = 25;
/** Events older than this are dropped rather than retried forever. */
const MAX_QUEUE = 500;

export function logStoryEvent(storyId: string, event: StoryEvent, o: { slide?: number; dwellMs?: number } = {}) {
  queue.push({
    story_id: storyId,
    event,
    slide_index: o.slide ?? null,
    dwell_ms: o.dwellMs === undefined ? null : Math.max(0, Math.min(3_600_000, Math.round(o.dwellMs))),
    created_at: new Date().toISOString(),
  });
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
  write(QUEUE_KEY, queue);
  if (queue.length >= FLUSH_AT) void flushStoryEvents();
  else if (!timer) timer = setTimeout(() => void flushStoryEvents(), FLUSH_AFTER_MS);
}

/** Sends queued events in one insert; on failure they stay queued for the next try. */
export async function flushStoryEvents() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (flushing || !queue.length) return;
  flushing = true;
  const batch = queue.slice(0, 200);
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    const { error } = await supabase.from('story_events').insert(batch);
    // A story deleted since (foreign key) would block the queue forever: drop that batch.
    if (!error || error.code === '23503') {
      queue = queue.slice(batch.length);
      write(QUEUE_KEY, queue);
    }
  } catch {
    // Offline: try again later.
  } finally {
    flushing = false;
    if (queue.length && !timer) timer = setTimeout(() => void flushStoryEvents(), FLUSH_AFTER_MS);
  }
}

// Send what's queued when the app goes to the background.
AppState.addEventListener('change', (state) => {
  if (state !== 'active') void flushStoryEvents();
});

// ─── Save, hide, mute ────────────────────────────────────────────────────────
export async function fetchSavedStoryIds(): Promise<string[]> {
  const { data, error } = await supabase.from('saved_stories').select('story_id');
  if (error) throw error;
  return (data ?? []).map((r) => r.story_id);
}

export async function setStorySaved(storyId: string, saved: boolean) {
  if (saved) {
    const { error } = await supabase
      .from('saved_stories')
      .upsert({ story_id: storyId }, { onConflict: 'user_id,story_id', ignoreDuplicates: true });
    if (error) throw error;
    logStoryEvent(storyId, 'save');
  } else {
    const { error } = await supabase.from('saved_stories').delete().eq('story_id', storyId);
    if (error) throw error;
  }
}

export async function muteTopic(topic: string) {
  const { error } = await supabase.from('muted_story_topics').upsert({ topic }, { onConflict: 'user_id,topic', ignoreDuplicates: true });
  if (error) throw error;
}

/** Drops stories from today's cached set, so a hidden story or muted topic disappears at once. */
export function removeFromCachedFeed(keep: (story: Story) => boolean) {
  const feed = read<DiscoverFeed>(FEED_KEY);
  if (feed) write(FEED_KEY, { ...feed, stories: feed.stories.filter(keep) });
}
