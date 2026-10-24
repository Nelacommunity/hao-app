import { useEffect, useState } from 'react';

import { isPlaceId, type Place, type PlaceCategory } from '@/data/places';
import type { Coords } from '@/lib/location';
import { supabase } from '@/lib/supabase';

/** A place search: around a point (closest first) or in a city, optionally by category or keywords. */
export type PlaceQuery =
  | { near: Coords; radius?: number; category?: PlaceCategory; q?: string; page?: number }
  | { city: string; category?: PlaceCategory; q?: string; page?: number };

const TTL_MS = 10 * 60_000;
// Every place seen in a result, so a place page opens instantly from a list or the map.
const byId = new Map<string, Place>();
const results = new Map<string, { at: number; promise: Promise<Place[]> }>();

async function get(params: URLSearchParams): Promise<Place[]> {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(`/api/places?${params}`, { headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}` } });
  const json = (await res.json().catch(() => null)) as { places?: Place[]; error?: string } | null;
  if (!res.ok || !json?.places) throw new Error(json?.error ?? `Request failed (${res.status})`);
  for (const p of json.places) byId.set(p.id, p);
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
  return params;
}

/** Cached for 10 minutes; nearby searches share a cache entry within ~100 m. */
export function fetchPlaces(query: PlaceQuery): Promise<Place[]> {
  const params = toParams(query);
  const key = params.toString().replace(/(lat|lng)=(-?\d+\.\d{3})\d*/g, '$1=$2');
  const hit = results.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise;
  const promise = get(params);
  results.set(key, { at: Date.now(), promise });
  promise.catch(() => results.delete(key));
  return promise;
}

export function getCachedPlace(id: string) {
  return byId.get(id);
}

/** Places by AMap id, in the order asked; unknown ids are skipped. */
export async function fetchPlacesById(ids: string[]): Promise<Place[]> {
  const missing = ids.filter((id) => isPlaceId(id) && !byId.has(id));
  for (let i = 0; i < missing.length; i += 10) {
    await get(new URLSearchParams({ ids: missing.slice(i, i + 10).join(',') }));
  }
  return ids.map((id) => byId.get(id)).filter((p): p is Place => !!p);
}

type State<T> = { key: string; value: T; error: string | null };

// One shared empty list, so screens memoizing on the results don't recompute while loading.
const NONE: Place[] = [];

/** Results for `query` (null = don't search yet). */
export function usePlaces(query: PlaceQuery | null) {
  const key = query ? toParams(query).toString() : '';
  const [state, setState] = useState<State<Place[]> | null>(null);

  useEffect(() => {
    if (!query) return;
    let cancelled = false;
    fetchPlaces(query).then(
      (value) => !cancelled && setState({ key, value, error: null }),
      (e: Error) => !cancelled && setState({ key, value: [], error: e.message })
    );
    return () => {
      cancelled = true;
    };
    // `key` captures everything in `query` that changes the result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const current = state?.key === key ? state : null;
  return { places: current?.value ?? NONE, loading: !!query && !current, error: current?.error ?? null };
}

/** One place by AMap id, from the cache when it was already shown in a list. */
export function usePlace(id: string | undefined) {
  const [state, setState] = useState<State<Place | null> | null>(() =>
    id && byId.has(id) ? { key: id, value: byId.get(id)!, error: null } : null
  );

  useEffect(() => {
    if (!id || !isPlaceId(id) || byId.has(id)) return;
    let cancelled = false;
    fetchPlacesById([id]).then(
      ([place]) => !cancelled && setState({ key: id, value: place ?? null, error: null }),
      (e: Error) => !cancelled && setState({ key: id, value: null, error: e.message })
    );
    return () => {
      cancelled = true;
    };
  }, [id]);

  const cached = id ? byId.get(id) : undefined;
  if (cached) return { place: cached, loading: false, error: null };
  if (!id || !isPlaceId(id)) return { place: null, loading: false, error: null };
  const current = state?.key === id ? state : null;
  return { place: current?.value ?? null, loading: !!id && !current, error: current?.error ?? null };
}
