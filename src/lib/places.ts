import { useEffect, useState } from 'react';

import { isPlaceId, type Place, type PlaceCategory } from '@/data/places';
import { getTravellerLanguage, useTravellerLanguage } from '@/lib/language-store';
import { distanceKm, type Coords } from '@/lib/location';
import { supabase } from '@/lib/supabase';

/** A place search: around a point (closest first) or in a city, optionally by category or keywords. */
export type PlaceQuery =
  | { near: Coords; radius?: number; category?: PlaceCategory; q?: string; page?: number }
  | { city: string; category?: PlaceCategory; q?: string; page?: number };

// Results are kept on the device (SQLite-backed localStorage) so screens open instantly, even after
// a restart or offline. Fresh results are used as they are; older ones are shown right away and
// refreshed in the background (stale-while-revalidate). Places come in the traveller's language, so
// the cache holds one language at a time and is stored per language. The API server has its own shared cache.
const FRESH_MS = 60 * 60_000;
const MAX_AGE_MS = 7 * 24 * 60 * 60_000;
const MAX_SEARCHES = 100;
const MAX_PLACES = 600;
// v2: v1 could hold Chinese-only names saved before places were localized.
const STORAGE_KEY = 'hao.places.v2';

// Every place seen in a result, so a place page opens instantly from a list or the map.
const byId = new Map<string, Place>();
const placeAt = new Map<string, number>();
const results = new Map<string, { at: number; ids: string[] }>();
const inFlight = new Map<string, Promise<Place[]>>();
const listeners = new Map<string, Set<(places: Place[]) => void>>();

type Stored = { places: [string, number, Place][]; searches: [string, number, string[]][] };

/** The language the in-memory cache holds. */
let loadedLang: string | null = null;
function load() {
  const lang = getTravellerLanguage().code;
  if (lang === loadedLang) return;
  loadedLang = lang;
  byId.clear();
  placeAt.clear();
  results.clear();
  try {
    globalThis.localStorage?.removeItem('hao.places.v1');
    const raw = globalThis.localStorage?.getItem(`${STORAGE_KEY}:${lang}`);
    if (!raw) return;
    const stored = JSON.parse(raw) as Stored;
    const oldest = Date.now() - MAX_AGE_MS;
    for (const [, at, place] of stored.places) {
      if (at > oldest) remember(place, at);
    }
    for (const [key, at, ids] of stored.searches) {
      if (at > oldest) results.set(key, { at, ids });
    }
  } catch {
    // A corrupt or unavailable store only costs a refetch.
  }
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
/** Writes the cache a moment after the last change, keeping only the newest entries. */
function save() {
  clearTimeout(saveTimer);
  const lang = loadedLang;
  saveTimer = setTimeout(() => {
    if (lang !== loadedLang) return;
    const searches = [...results].sort((a, b) => b[1].at - a[1].at).slice(0, MAX_SEARCHES);
    const keep = new Set(searches.flatMap(([, r]) => r.ids));
    // Places in kept searches first, then the most recently seen others (opened from saved places, links…).
    const ids = [...byId.keys()].sort((a, b) => Number(keep.has(b)) - Number(keep.has(a)) || placeAt.get(b)! - placeAt.get(a)!).slice(0, MAX_PLACES);
    const stored: Stored = {
      places: ids.map((id) => [id, placeAt.get(id)!, byId.get(id)!]),
      searches: searches.map(([key, r]) => [key, r.at, r.ids]),
    };
    try {
      globalThis.localStorage?.setItem(`${STORAGE_KEY}:${lang}`, JSON.stringify(stored));
    } catch {
      // Storage full or unavailable: the in-memory cache still works.
    }
  }, 1000);
}

function remember(place: Place, at = Date.now()) {
  byId.set(place.id, place);
  placeAt.set(place.id, at);
}

async function get(params: URLSearchParams): Promise<Place[]> {
  load();
  const lang = loadedLang;
  const { data } = await supabase.auth.getSession();
  const res = await fetch(`/api/places?${params}`, { headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}` } });
  const json = (await res.json().catch(() => null)) as { places?: Place[]; error?: string } | null;
  if (!res.ok || !json?.places) throw new Error(json?.error ?? `Request failed (${res.status})`);
  // The language changed while this was loading: don't mix it into the new language's cache.
  if (lang !== loadedLang) return json.places;
  for (const p of json.places) remember(p);
  save();
  return json.places;
}

function toParams(query: PlaceQuery) {
  const params = new URLSearchParams();
  if ('near' in query) {
    params.set('lat', query.near.latitude.toFixed(5));
    params.set('lng', query.near.longitude.toFixed(5));
    if (query.radius) params.set('radius', String(query.radius));
  } else {
    params.set('city', query.city);
  }
  if (query.category) params.set('category', query.category);
  if (query.q) params.set('q', query.q);
  if (query.page) params.set('page', String(query.page));
  setLanguage(params);
  return params;
}

function setLanguage(params: URLSearchParams) {
  const language = getTravellerLanguage();
  params.set('lang', language.code);
  if (language.code.startsWith('custom:')) params.set('langName', language.name);
}

/** Nearby searches share a cache entry within ~100 m. */
const cacheKey = (params: URLSearchParams) => params.toString().replace(/(lat|lng)=(-?\d+\.\d{3})\d*/g, '$1=$2');

/** The cached result for `key` if every place in it is still known, with its age. */
function cached(key: string) {
  load();
  const hit = results.get(key);
  if (!hit || Date.now() - hit.at >= MAX_AGE_MS) return null;
  const places = hit.ids.map((id) => byId.get(id));
  if (places.some((p) => !p)) return null;
  return { places: places as Place[], age: Date.now() - hit.at };
}

/** Asks the server (one request per key at a time) and tells every screen showing that key. */
function refresh(key: string, params: URLSearchParams): Promise<Place[]> {
  const running = inFlight.get(key);
  if (running) return running;
  const promise = get(params)
    .then((places) => {
      results.set(key, { at: Date.now(), ids: places.map((p) => p.id) });
      save();
      listeners.get(key)?.forEach((fn) => fn(places));
      return places;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

/** Cached results right away (refreshed in the background once older than an hour), else the server. */
export function fetchPlaces(query: PlaceQuery): Promise<Place[]> {
  const params = toParams(query);
  const key = cacheKey(params);
  const hit = cached(key);
  if (!hit) return refresh(key, params);
  if (hit.age >= FRESH_MS) refresh(key, params).catch(() => {});
  return Promise.resolve(hit.places);
}

/** Adds a place that came from elsewhere (e.g. a card in the Hao chat) so place pages and Explore can open it. */
export function cachePlace(place: Place) {
  load();
  if (!byId.has(place.id)) remember(place);
}

export function getCachedPlace(id: string) {
  load();
  return byId.get(id);
}

/** The closest place already on the device to `near` (within `maxM`), e.g. for the SOS sheet. Works offline. */
export function nearestCachedPlace(near: Coords, maxM = 1500): { place: Place; distanceM: number } | null {
  load();
  let best: { place: Place; distanceM: number } | null = null;
  for (const place of byId.values()) {
    const distanceM = distanceKm(near, place) * 1000;
    if (distanceM <= maxM && (!best || distanceM < best.distanceM)) best = { place, distanceM };
  }
  return best;
}

/** Places by AMap id, in the order asked; unknown ids are skipped. */
export async function fetchPlacesById(ids: string[]): Promise<Place[]> {
  load();
  const now = Date.now();
  const missing = ids.filter((id) => isPlaceId(id) && (!byId.has(id) || now - placeAt.get(id)! >= MAX_AGE_MS));
  try {
    for (let i = 0; i < missing.length; i += 10) {
      const params = new URLSearchParams({ ids: missing.slice(i, i + 10).join(',') });
      setLanguage(params);
      await get(params);
    }
  } catch (e) {
    // Offline (or the server is down): the copies on the device are still better than nothing.
    if (!ids.some((id) => byId.has(id))) throw e;
  }
  return ids.map((id) => byId.get(id)).filter((p): p is Place => !!p);
}

type State<T> = { key: string; value: T; error: string | null };

// One shared empty list, so screens memoizing on the results don't recompute while loading.
const NONE: Place[] = [];

/** Results for `query` (null = don't search yet). Cached results show immediately. */
export function usePlaces(query: PlaceQuery | null) {
  // Re-render in a new language; the language is part of `key` through toParams.
  useTravellerLanguage();
  const key = query ? toParams(query).toString() : '';
  const [state, setState] = useState<State<Place[]> | null>(() => {
    const hit = query ? cached(cacheKey(toParams(query))) : null;
    return hit ? { key, value: hit.places, error: null } : null;
  });

  useEffect(() => {
    if (!query) return;
    let cancelled = false;
    const update = (value: Place[]) => !cancelled && setState({ key, value, error: null });
    const shared = cacheKey(toParams(query));
    const subscribers = listeners.get(shared) ?? new Set();
    listeners.set(shared, subscribers.add(update));
    fetchPlaces(query).then(update, (e: Error) => !cancelled && setState({ key, value: [], error: e.message }));
    return () => {
      cancelled = true;
      subscribers.delete(update);
      if (!subscribers.size) listeners.delete(shared);
    };
    // `key` captures everything in `query` that changes the result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const current = state?.key === key ? state : null;
  return { places: current?.value ?? NONE, loading: !!query && !current, error: current?.error ?? null };
}

/** One place by AMap id, from the cache when it was already shown in a list. */
export function usePlace(id: string | undefined) {
  const lang = useTravellerLanguage().code;
  const key = `${lang}:${id}`;
  const [state, setState] = useState<State<Place | null> | null>(() =>
    id && getCachedPlace(id) ? { key, value: byId.get(id)!, error: null } : null
  );

  useEffect(() => {
    if (!id || !isPlaceId(id) || getCachedPlace(id)) return;
    let cancelled = false;
    fetchPlacesById([id]).then(
      ([place]) => !cancelled && setState({ key, value: place ?? null, error: null }),
      (e: Error) => !cancelled && setState({ key, value: null, error: e.message })
    );
    return () => {
      cancelled = true;
    };
    // `key` covers the id and the language.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const known = id ? getCachedPlace(id) : undefined;
  if (known) return { place: known, loading: false, error: null };
  if (!id || !isPlaceId(id)) return { place: null, loading: false, error: null };
  const current = state?.key === key ? state : null;
  return { place: current?.value ?? null, loading: !!id && !current, error: current?.error ?? null };
}
