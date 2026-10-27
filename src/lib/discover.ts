// Discover beyond the generated stories: real AMap places and a phrase of the day mixed into the feed, likes
// everyone can see, sharing, and Hao's voice guide that explains any item aloud.
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Share } from 'react-native';

import { Cities, type Place } from '@/data/places';
import { PhraseGroups, type Phrase } from '@/data/phrases';
import { getTravellerLanguage } from '@/lib/language-store';
import type { Coords } from '@/lib/location';
import { fetchPlaces } from '@/lib/places';
import type { Story } from '@/lib/stories';
import { supabase } from '@/lib/supabase';

export type DiscoverItem =
  | { kind: 'story'; id: string; story: Story }
  | { kind: 'place'; id: string; place: Place }
  | { kind: 'phrase'; id: string; phrase: Phrase; group: string };

/** The key likes are stored under (see the discover_likes migration). */
export const itemKey = (item: DiscoverItem) =>
  item.kind === 'story' ? `story:${item.story.id}` : item.kind === 'place' ? `place:${item.place.id}` : `phrase:${item.phrase.zh}`;

// ─── What goes in the feed ───────────────────────────────────────────────────

/** Today's phrase from the built-in list, the same for everyone on a given (China) day. */
export function phraseOfTheDay(day: string): DiscoverItem {
  const all = PhraseGroups.flatMap((g) => g.phrases.map((phrase) => ({ phrase, group: g.title })));
  const n = Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
  const pick = all[((n % all.length) + all.length) % all.length];
  return { kind: 'phrase', id: `phrase:${pick.phrase.zh}`, ...pick };
}

/**
 * Cultural places and landmarks with real AMap photos: around the user when we know where they are,
 * otherwise in the feed's city. Best rated first, at most `limit`.
 */
export async function culturePlaces(o: { near: Coords | null; city: string | null; limit?: number }): Promise<DiscoverItem[]> {
  const cityZh = Cities.find((c) => c.name.toLowerCase() === (o.city ?? '').toLowerCase())?.nameZh ?? Cities[0].nameZh;
  const query = (category: 'culture' | 'landmark') =>
    fetchPlaces(o.near ? { near: o.near, radius: 20_000, category } : { city: cityZh, category }).catch(() => [] as Place[]);
  const [culture, landmarks] = await Promise.all([query('culture'), query('landmark')]);
  const seen = new Set<string>();
  return [...culture, ...landmarks]
    .filter((p) => p.photos.length > 0 && !seen.has(p.id) && seen.add(p.id))
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, o.limit ?? 8)
    .map((place) => ({ kind: 'place' as const, id: `place:${place.id}`, place }));
}

/** Stories with a place after every two, and the phrase second (when there's no phrase story today). */
export function mixFeed(stories: Story[], places: DiscoverItem[], phrase: DiscoverItem | null): DiscoverItem[] {
  const out: DiscoverItem[] = [];
  const queue = [...places];
  stories.forEach((story, i) => {
    out.push({ kind: 'story', id: story.id, story });
    if (i % 2 === 1 && queue.length) out.push(queue.shift()!);
  });
  out.push(...queue);
  if (phrase && !stories.some((s) => s.type === 'phrase_of_the_day')) out.splice(Math.min(1, out.length), 0, phrase);
  return out;
}

// ─── Likes ───────────────────────────────────────────────────────────────────

export async function fetchLikes(keys: string[]): Promise<{ counts: Record<string, number>; mine: Set<string> }> {
  if (!keys.length) return { counts: {}, mine: new Set() };
  const [counts, mine] = await Promise.all([
    supabase.rpc('discover_like_counts', { item_keys: keys.slice(0, 100) }),
    supabase.from('discover_likes').select('item_key').in('item_key', keys.slice(0, 100)),
  ]);
  if (counts.error) throw counts.error;
  if (mine.error) throw mine.error;
  return {
    counts: Object.fromEntries((counts.data ?? []).map((r) => [r.item_key, Number(r.likes)])),
    mine: new Set((mine.data ?? []).map((r) => r.item_key)),
  };
}

export async function setLiked(key: string, liked: boolean) {
  const { error } = liked
    ? await supabase.from('discover_likes').upsert({ item_key: key }, { onConflict: 'user_id,item_key', ignoreDuplicates: true })
    : await supabase.from('discover_likes').delete().eq('item_key', key);
  if (error) throw error;
}

// ─── Sharing ─────────────────────────────────────────────────────────────────

export function shareItem(item: DiscoverItem, t: (s: string, v?: Record<string, string | number>) => string) {
  let message = '';
  if (item.kind === 'story') {
    const s = item.story;
    message = `${s.title}\n\n${s.slides.map((x) => `${x.heading}. ${x.body}`).join('\n\n')}`;
  } else if (item.kind === 'place') {
    const p = item.place;
    const map = `https://uri.amap.com/marker?position=${p.longitude},${p.latitude}&name=${encodeURIComponent(p.nameZh || p.name)}&coordinate=gaode&callnative=1`;
    message = `${p.name}${p.nameZh && p.nameZh !== p.name ? ` · ${p.nameZh}` : ''}\n${p.addressZh || p.address}\n${map}`;
  } else {
    message = `${item.phrase.zh} (${item.phrase.pinyin})\n${t(item.phrase.en)}`;
  }
  return Share.share({ message: `${message}\n\n${t('Discovered with Hao')}` }).catch(() => {});
}

// ─── Hao's voice guide ───────────────────────────────────────────────────────

const explained = new Map<string, string>();

async function explain(item: DiscoverItem): Promise<string> {
  const language = getTravellerLanguage();
  const cacheKey = `${language.code}|${itemKey(item)}`;
  const hit = explained.get(cacheKey);
  if (hit) return hit;
  const p = item.kind === 'place' ? item.place : null;
  const body = {
    language: { code: language.code, name: language.name },
    item:
      item.kind === 'story'
        ? { kind: 'story', id: item.story.id }
        : p
          ? { kind: 'place', place: { id: p.id, name: p.name, nameZh: p.nameZh, type: p.type, typeZh: p.typeZh, cityZh: p.cityZh, districtZh: p.districtZh, address: p.address, rating: p.rating, tags: p.tags } }
          : { kind: 'phrase', phrase: item.kind === 'phrase' ? { ...item.phrase } : null },
  };
  const { data } = await supabase.auth.getSession();
  const res = await fetch('/api/discover-guide', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as { text?: string; error?: string } | null;
  if (!res.ok || !json?.text) throw new Error(json?.error ?? `Hao could not explain this (${res.status})`);
  explained.set(cacheKey, json.text);
  return json.text;
}

export type GuideState = { key: string; status: 'loading' | 'speaking' | 'done' | 'error'; text: string; error?: string } | null;

/** Plays Hao's explanation of one item at a time; starting another (or `stop`) ends the current one. */
export function useHaoGuide() {
  const [state, setState] = useState<GuideState>(null);
  const current = useRef<string | null>(null);

  const speak = useCallback((key: string, text: string) => {
    current.current = key;
    Speech.stop();
    const finish = () => {
      if (current.current === key) setState((s) => (s?.key === key ? { ...s, status: 'done' } : s));
    };
    setState({ key, status: 'speaking', text });
    Speech.speak(text, { language: getTravellerLanguage().speech, rate: 0.95, onDone: finish, onStopped: finish, onError: finish });
  }, []);

  const stop = useCallback(() => {
    current.current = null;
    Speech.stop();
    setState(null);
  }, []);

  const play = useCallback(
    (item: DiscoverItem) => {
      const key = itemKey(item);
      current.current = key;
      Speech.stop();
      setState({ key, status: 'loading', text: '' });
      explain(item).then(
        (text) => {
          if (current.current === key) speak(key, text);
        },
        (e: Error) => {
          if (current.current === key) setState({ key, status: 'error', text: '', error: e.message });
        }
      );
    },
    [speak]
  );

  /** Replays the last explanation without asking the server again. */
  const replay = useCallback(() => {
    if (state?.text) speak(state.key, state.text);
  }, [state, speak]);

  useEffect(() => () => void Speech.stop(), []);
  return { state, play, stop, replay };
}
