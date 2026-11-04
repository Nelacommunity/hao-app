// The Guide's content from the database (guide_* tables): topic chips and suggested apps for the Guide chat,
// and embassies for the SOS sheet. Each is kept on the device, so it shows instantly and works offline.
import { useEffect, useMemo, useState } from 'react';

import { findEmbassies, type Embassy, type GuideApp, type GuideTopic } from '@shared/ai/knowledge';
import { Countries } from '@shared/places/countries';

import { supabase } from '@/lib/supabase';

export type GuideContent = { topics: GuideTopic[]; apps: GuideApp[] };

const EMPTY: GuideContent = { topics: [], apps: [] };

function readCache<T>(key: string): T | null {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: unknown) {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable: the next fetch still works.
  }
}

// ─── Guide chat: topics and apps ────────────────────────────────────────────
const contentKey = (lang: string) => `hao.guide.content.${lang}`;
const fetched = new Map<string, Promise<GuideContent | null>>();

function fetchContent(lang: string) {
  let job = fetched.get(lang);
  if (!job) {
    job = fetch(`/api/guide-content?lang=${encodeURIComponent(lang)}`)
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as (GuideContent & { complete?: boolean }) | null;
        if (!res.ok || !json?.topics) throw new Error(`HTTP ${res.status}`);
        const content = { topics: json.topics, apps: json.apps ?? [] };
        // An untranslated set is shown but asked for again next time.
        if (json.complete !== false) writeCache(contentKey(lang), content);
        else fetched.delete(lang);
        return content;
      })
      .catch((e) => {
        console.warn('[guide] could not load topics', e);
        fetched.delete(lang);
        return null;
      });
    fetched.set(lang, job);
  }
  return job;
}

/** Topic chips (in `lang`, English until translated) and the apps Hao may suggest. */
export function useGuideContent(lang: string): GuideContent {
  const [fresh, setFresh] = useState<{ lang: string; content: GuideContent } | null>(null);
  const cached = useMemo(
    () => readCache<GuideContent>(contentKey(lang)) ?? readCache<GuideContent>(contentKey('en')) ?? EMPTY,
    [lang]
  );
  useEffect(() => {
    let cancelled = false;
    fetchContent(lang).then((content) => !cancelled && content && setFresh({ lang, content }));
    return () => {
      cancelled = true;
    };
  }, [lang]);
  return fresh?.lang === lang ? fresh.content : cached;
}

// ─── SOS: embassies in Beijing ──────────────────────────────────────────────
const EMBASSIES_KEY = 'hao.guide.embassies';

async function fetchEmbassies(): Promise<Embassy[] | null> {
  const { data, error } = await supabase.from('guide_embassies').select('country, phone, address, region');
  if (error || !data?.length) return null;
  writeCache(EMBASSIES_KEY, data);
  return data;
}

const embassyIn = (list: Embassy[] | null, nationality: string | null | undefined) => {
  const country = nationality ? Countries[nationality] : null;
  return list && country ? (findEmbassies(list, country, 1)[0] ?? null) : null;
};

/** The traveller's embassy in Beijing, from their nationality (ISO code): the device copy first, then the server. */
export function useEmbassy(nationality: string | null | undefined): Embassy | null {
  const [list, setList] = useState<Embassy[] | null>(() => readCache<Embassy[]>(EMBASSIES_KEY));
  useEffect(() => {
    let cancelled = false;
    fetchEmbassies()
      .then((fresh) => !cancelled && fresh && setList(fresh))
      .catch(() => {
        // No signal: keep the copy on the device.
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return embassyIn(list, nationality);
}
