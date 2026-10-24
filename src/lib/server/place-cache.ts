// Two-level cache in front of AMap for API routes: process memory, then Supabase (shared by every
// server instance and every user). Stale entries are served right away and refreshed in the
// background, concurrent identical requests share one AMap call, and if AMap fails (quota, outage)
// we fall back to whatever we have, however old.
import type { Place } from '@/data/places';
import { adminClient } from '@/lib/server/admin';

const HOUR = 3_600_000;
/** Search results: new places open, rankings shift — refresh daily. */
const SEARCH_FRESH_MS = 24 * HOUR;
/** A place's details (hours, rating, photos) change slowly. */
const PLACE_FRESH_MS = 7 * 24 * HOUR;
/** Older than this, wait for AMap instead of showing it (still used if AMap fails). */
const MAX_STALE_MS = 30 * 24 * HOUR;

const MEMORY_SEARCHES = 500;
const MEMORY_PLACES = 5000;

type Entry<T> = { at: number; value: T };

/** Map with least-recently-used eviction. */
class Lru<T> {
  private map = new Map<string, Entry<T>>();
  constructor(private max: number) {}
  get(key: string) {
    const hit = this.map.get(key);
    if (hit) {
      this.map.delete(key);
      this.map.set(key, hit);
    }
    return hit;
  }
  set(key: string, value: T, at = Date.now()) {
    this.map.delete(key);
    this.map.set(key, { at, value });
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value!);
  }
}

const searches = new Lru<string[]>(MEMORY_SEARCHES);
const places = new Lru<Place>(MEMORY_PLACES);
const inFlight = new Map<string, Promise<unknown>>();

/** Runs `job` once per key at a time; callers arriving meanwhile get the same promise. */
function once<T>(key: string, job: () => Promise<T>): Promise<T> {
  const running = inFlight.get(key);
  if (running) return running as Promise<T>;
  const promise = job().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

const age = (e: { at: number } | undefined) => (e ? Date.now() - e.at : Infinity);

/** `distanceM` belongs to one search, not to the place. */
function stripDistance({ distanceM: _, ...place }: Place): Place {
  return place;
}

async function savePlaces(list: Place[]) {
  const now = Date.now();
  for (const p of list) places.set(p.id, stripDistance(p), now);
  const db = adminClient();
  if (!db || !list.length) return;
  const at = new Date(now).toISOString();
  const { error } = await db.from('place_cache').upsert(list.map((p) => ({ id: p.id, place: stripDistance(p), fetched_at: at })));
  if (error) console.warn('[place-cache] could not save places:', error.message);
}

/** Places saved before English names worked have no `type`; they're fetched again. */
const isCurrent = (p: Place) => p.type !== undefined;

/** Cached places by id (memory first, then Supabase); ids we have nothing for are left out. */
async function loadPlaces(ids: string[]): Promise<Map<string, Entry<Place>>> {
  const out = new Map<string, Entry<Place>>();
  const missing: string[] = [];
  for (const id of ids) {
    const hit = places.get(id);
    if (hit && isCurrent(hit.value)) out.set(id, hit);
    else missing.push(id);
  }
  const db = adminClient();
  if (db && missing.length) {
    const { data, error } = await db.from('place_cache').select('id, place, fetched_at').in('id', missing);
    if (error) console.warn('[place-cache] could not read places:', error.message);
    for (const row of data ?? []) {
      if (!isCurrent(row.place as Place)) continue;
      const at = Date.parse(row.fetched_at);
      places.set(row.id, row.place as Place, at);
      out.set(row.id, { at, value: row.place as Place });
    }
  }
  return out;
}

async function loadSearch(key: string): Promise<Entry<string[]> | undefined> {
  const hit = searches.get(key);
  if (hit) return hit;
  const db = adminClient();
  if (!db) return undefined;
  const { data, error } = await db.from('place_search_cache').select('ids, fetched_at').eq('key', key).maybeSingle();
  if (error) console.warn('[place-cache] could not read search:', error.message);
  if (!data) return undefined;
  const at = Date.parse(data.fetched_at);
  searches.set(key, data.ids, at);
  return { at, value: data.ids };
}

function refreshSearch(key: string, fetch: () => Promise<Place[]>) {
  return once(`search:${key}`, async () => {
    const list = await fetch();
    const now = Date.now();
    searches.set(key, list.map((p) => p.id), now);
    await savePlaces(list);
    const db = adminClient();
    if (db) {
      const { error } = await db
        .from('place_search_cache')
        .upsert({ key, ids: list.map((p) => p.id), fetched_at: new Date(now).toISOString() });
      if (error) console.warn('[place-cache] could not save search:', error.message);
    }
    return list;
  });
}

const background = (job: Promise<unknown>) => job.catch((e) => console.warn('[place-cache] background refresh failed:', (e as Error).message));

/**
 * A place search through the cache. `key` must identify everything that changes the result.
 * Fresh → cached. Stale but not too old → cached now, refreshed in the background.
 * Missing or too old → AMap, falling back to the old result if AMap fails.
 */
export async function cachedSearch(key: string, fetch: () => Promise<Place[]>): Promise<Place[]> {
  const search = await loadSearch(key);
  if (search) {
    const found = await loadPlaces(search.value);
    const list = search.value.map((id) => found.get(id)?.value).filter((p): p is Place => !!p);
    // Every place must still be cached; a hole means the rows were pruned, so fetch again.
    const complete = list.length === search.value.length;
    if (complete && age(search) < SEARCH_FRESH_MS) return list;
    if (complete && age(search) < MAX_STALE_MS) {
      background(refreshSearch(key, fetch));
      return list;
    }
    try {
      return await refreshSearch(key, fetch);
    } catch (e) {
      if (list.length) return list;
      throw e;
    }
  }
  return refreshSearch(key, fetch);
}

/**
 * Places by id through the cache, in the order asked. Only ids that are missing or too old go to
 * AMap (`fetch` gets at most 10 at a time); stale ones are returned and refreshed in the background.
 */
export async function cachedPlacesById(ids: string[], fetch: (ids: string[]) => Promise<Place[]>): Promise<Place[]> {
  const found = await loadPlaces(ids);
  const needed = ids.filter((id) => age(found.get(id)) >= MAX_STALE_MS);
  const stale = ids.filter((id) => !needed.includes(id) && age(found.get(id)) >= PLACE_FRESH_MS);

  const fetchBatch = (batch: string[]) =>
    once(`ids:${batch.join('|')}`, async () => {
      const list = await fetch(batch);
      await savePlaces(list);
      return list;
    });

  for (let i = 0; i < stale.length; i += 10) background(fetchBatch(stale.slice(i, i + 10)));

  const batches: string[][] = [];
  for (let i = 0; i < needed.length; i += 10) batches.push(needed.slice(i, i + 10));
  const results = await Promise.allSettled(batches.map(fetchBatch));
  const fetched = new Map<string, Place>();
  results.forEach((r) => r.status === 'fulfilled' && r.value.forEach((p) => fetched.set(p.id, p)));
  // Nothing at all to show: surface AMap's error instead of an empty list.
  const failure = results.find((r) => r.status === 'rejected');
  if (failure && !fetched.size && !found.size) throw failure.reason;

  return ids.map((id) => fetched.get(id) ?? found.get(id)?.value).filter((p): p is Place => !!p);
}

// ─── Nearby search keys ──────────────────────────────────────────────────────

const M_PER_DEG = 111_320;

/**
 * Snaps a nearby search to a grid whose cells are 1/20 of the radius (at least 100 m), so people
 * searching from a few streets apart share one cached result instead of each costing an AMap call.
 * Returns the cell centre to search from and a radius padded to still cover the original circle.
 */
export function snapNearby(lat: number, lng: number, radius: number) {
  const cell = Math.max(100, radius / 20);
  const dLat = cell / M_PER_DEG;
  const snappedLat = Math.round(lat / dLat) * dLat;
  const dLng = cell / (M_PER_DEG * Math.cos((snappedLat * Math.PI) / 180));
  const snappedLng = Math.round(lng / dLng) * dLng;
  return {
    lat: snappedLat,
    lng: snappedLng,
    radius: Math.min(50_000, Math.round(radius + cell * Math.SQRT1_2)),
    cellKey: `${Math.round(lat / dLat)},${Math.round(lng / dLng)}@${Math.round(cell)}`,
  };
}

/** Metres between two points (haversine). */
function metres(aLat: number, aLng: number, bLat: number, bLng: number) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(bLat - aLat) / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** Distances from the user's real position (the cached search ran from the cell centre). */
export function withDistances(list: Place[], lat: number, lng: number, sortByDistance: boolean) {
  const out = list.map((p) => ({ ...p, distanceM: Math.round(metres(lat, lng, p.latitude, p.longitude)) }));
  return sortByDistance ? out.sort((a, b) => a.distanceM - b.distanceM) : out;
}
