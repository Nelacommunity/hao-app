// Places in the traveller's language for API routes. AMap gives Chinese and English; every other
// language (and the Chinese-only types and tags) is translated once by AI, stored in Supabase for
// everyone, and kept in memory. If translation isn't possible the English/Chinese text is returned.
import type { PlaceText } from '@shared/ai/types';

import type { Place } from '@/data/places';
import { Languages } from '@/lib/languages';
import { adminClient } from '@/lib/server/admin';
import { providerOrError } from '@/lib/server/api';

export type PlaceLanguage = { code: string; name: string };

/** The traveller's language from a request (code, plus the name for a custom one); null keeps AMap's English. */
export function placeLanguage(rawCode: unknown, rawName?: unknown): PlaceLanguage | null {
  const code = String(rawCode ?? '').trim().slice(0, 80);
  if (code === 'zh' || code === 'zh-CN') return { code, name: 'Chinese (Simplified)' };
  const known = Languages.find((l) => l.code === code);
  if (known) return { code, name: known.name };
  const custom = String(rawName ?? '').replace(/[^\p{L}\p{M} '-]/gu, '').trim().slice(0, 40);
  return code.startsWith('custom:') && custom.length >= 2 ? { code, name: custom } : null;
}

const BATCH = 25;
const MEMORY_MAX = 20_000;

/** `${lang}:${placeId}` → translation, with the English name it was made from. */
const memory = new Map<string, PlaceText & { source: string }>();
const inFlight = new Map<string, Promise<void>>();
/** Languages whose translation failed recently, so a broken AI key doesn't slow every search. */
const failedAt = new Map<string, number>();
const RETRY_AFTER_FAILURE_MS = 5 * 60_000;

const isChinese = (code: string) => code === 'zh' || code === 'zh-CN';

function remember(key: string, value: PlaceText & { source: string }) {
  memory.delete(key);
  memory.set(key, value);
  if (memory.size > MEMORY_MAX) memory.delete(memory.keys().next().value!);
}

const source = (p: Place): PlaceText => ({ name: p.name, address: p.address, type: p.type || p.typeZh, tags: p.tags });

async function load(lang: string, places: Place[]) {
  const db = adminClient();
  const missing = places.filter((p) => !memory.has(`${lang}:${p.id}`));
  if (!db || !missing.length) return;
  const { data, error } = await db
    .from('place_translations')
    .select('place_id, name, address, type, tags, source_name')
    .eq('lang', lang)
    .in('place_id', missing.map((p) => p.id));
  if (error) console.warn('[place-i18n] could not read translations:', error.message);
  for (const row of data ?? []) {
    remember(`${lang}:${row.place_id}`, { name: row.name, address: row.address, type: row.type, tags: row.tags, source: row.source_name });
  }
}

async function translate(language: PlaceLanguage, places: Place[]) {
  const created = providerOrError();
  if ('error' in created) throw new Error('AI provider is not configured');
  const out = await created.provider.translatePlaces({ places: places.map(source), target: language });
  const rows = places.flatMap((p, i) => {
    const t = out[i];
    if (!t) return [];
    remember(`${language.code}:${p.id}`, { ...t, source: p.name });
    return [{ place_id: p.id, lang: language.code, ...t, source_name: p.name, updated_at: new Date().toISOString() }];
  });
  const db = adminClient();
  if (db && rows.length) {
    const { error } = await db.from('place_translations').upsert(rows);
    if (error) console.warn('[place-i18n] could not save translations:', error.message);
  }
}

/** One AI call per batch of places, shared by concurrent requests asking for the same ones. */
function translateOnce(language: PlaceLanguage, places: Place[]) {
  const key = `${language.code}:${places.map((p) => p.id).join(',')}`;
  let job = inFlight.get(key);
  if (!job) {
    job = translate(language, places).finally(() => inFlight.delete(key));
    inFlight.set(key, job);
  }
  return job;
}

/** `places` with name, address, type and tags in `language` (Chinese and English come from AMap). */
export async function localizePlaces(places: Place[], language: PlaceLanguage | null): Promise<Place[]> {
  if (!language || !places.length) return places;
  if (isChinese(language.code)) return places.map((p) => ({ ...p, name: p.nameZh, address: p.addressZh, type: p.typeZh }));

  await load(language.code, places);
  // Translate what's new, or what was translated from a name AMap has since changed.
  // In English only the Chinese tags need it: AMap's English name, address and type are used as they are.
  const needed = places.filter(
    (p) => (language.code !== 'en' || p.tags.length > 0) && memory.get(`${language.code}:${p.id}`)?.source !== p.name
  );
  if (needed.length && Date.now() - (failedAt.get(language.code) ?? 0) > RETRY_AFTER_FAILURE_MS) {
    const batches: Place[][] = [];
    for (let i = 0; i < needed.length; i += BATCH) batches.push(needed.slice(i, i + BATCH));
    const results = await Promise.allSettled(batches.map((b) => translateOnce(language, b)));
    const failure = results.find((r) => r.status === 'rejected');
    if (failure) {
      failedAt.set(language.code, Date.now());
      console.warn('[place-i18n] translation failed', language.code, (failure.reason as Error).message);
    }
  }

  return places.map((p) => {
    const t = memory.get(`${language.code}:${p.id}`);
    if (!t) return p;
        if (language.code === 'en') return { ...p, tags: t.tags };
    return { ...p, name: t.name, address: t.address, type: t.type, tags: t.tags };
  });
}
