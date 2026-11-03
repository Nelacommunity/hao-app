// The user's visits ("My Places", "My Food") and "Did you go?" questions. Reads and changes go
// straight to Supabase with the user's session (row-level security keeps them private); new visits
// go through /api/visits so the place is looked up on AMap by the server.
import * as Location from 'expo-location';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { ARRIVAL_RADIUS_M, NAVIGATION_MEMORY_HOURS } from '@shared/places/config';

import type { VisitCardData } from '@/data/place-cards';
import { placeFromRow, type Place } from '@/data/places';
import { wgs84ToGcj02 } from '@/lib/china-coords';
import { getTravellerLanguage } from '@/lib/language-store';
import { distanceKm } from '@/lib/location';
import { withOfflineCopy } from '@/lib/offline';
import { supabase } from '@/lib/supabase';
import '@/lib/supabase-storage';

export type { VisitCardData };
/** The filters on My Places: everything, food, sights and other places, or hotels. */
export type PlacesGroup = 'all' | 'food' | 'places' | 'hotels';

export const isPlacesGroup = (v: unknown): v is PlacesGroup => v === 'all' || v === 'food' || v === 'places' || v === 'hotels';

export function inGroup(place: Place, group: PlacesGroup) {
  if (group === 'all') return true;
  if (group === 'food') return place.category === 'food';
  if (group === 'hotels') return place.category === 'hotel';
  return place.category !== 'food' && place.category !== 'hotel';
}

const VISIT_COLUMNS =
  'id, status, rating, tags, note, visited_at, source, places!inner(id, amap_poi_id, name, name_zh, category, lat, lng, address, tags, amap_rating)';

type VisitRow = {
  id: string;
  status: string;
  rating: number | null;
  tags: string[];
  note: string | null;
  visited_at: string;
  source: string;
  places: Parameters<typeof placeFromRow>[0];
};

const toCard = (v: VisitRow): VisitCardData => ({
  visitId: v.id,
  place: placeFromRow(v.places),
  status: v.status as VisitCardData['status'],
  rating: v.rating,
  tags: v.tags,
  note: v.note,
  visitedAt: v.visited_at,
  source: v.source as VisitCardData['source'],
});

/** Every confirmed visit, newest first (filter with inGroup). */
export function fetchVisits(): Promise<VisitCardData[]> {
  return withOfflineCopy('visits', async () => {
    const { data, error } = await supabase
      .from('visits')
      .select(VISIT_COLUMNS)
      .eq('status', 'confirmed')
      .order('visited_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    return (data as VisitRow[]).map(toCard);
  });
}

/** Visits waiting for "Did you go?" (asked in chat or not), for the To review section. */
export async function fetchPendingVisits(): Promise<VisitCardData[]> {
  const { data, error } = await supabase.from('visits').select(VISIT_COLUMNS).eq('status', 'pending').order('created_at', { ascending: false }).limit(20);
  if (error) throw error;
  return (data as VisitRow[]).map(toCard);
}

/** Visits Hao hasn't asked about yet ("Did you go to …?"). */
export async function fetchUnaskedVisits(): Promise<VisitCardData[]> {
  const { data, error } = await supabase
    .from('visits')
    .select(VISIT_COLUMNS)
    .eq('status', 'pending')
    .is('prompted_at', null)
    .order('created_at', { ascending: false })
    .limit(3);
  if (error) throw error;
  return (data as VisitRow[]).map(toCard);
}

/** Hao asks only once: mark the questions as shown. */
export async function markAsked(visitIds: string[]) {
  if (!visitIds.length) return;
  await supabase.from('visits').update({ prompted_at: new Date().toISOString() }).in('id', visitIds);
}

export async function countVisits(): Promise<number> {
  const { count } = await supabase.from('visits').select('id', { count: 'exact', head: true }).eq('status', 'confirmed');
  return count ?? 0;
}

/** "Yes, I went": 1 liked, -1 didn't, null no opinion. Merges into an earlier visit to the same place. */
export async function confirmVisit(visitId: string, rating: number | null, tags: string[]) {
  const { data, error } = await supabase.rpc('confirm_visit', { visit_id: visitId, visit_rating: rating, visit_tags: tags });
  if (error) throw error;
  return data;
}

/** "Skip": don't count it and don't ask again. */
export async function dismissVisit(visitId: string) {
  const { error } = await supabase.from('visits').update({ status: 'dismissed', prompted_at: new Date().toISOString() }).eq('id', visitId);
  if (error) throw error;
}

export async function updateVisit(visitId: string, changes: { rating?: number | null; tags?: string[]; note?: string | null }) {
  const { error } = await supabase.from('visits').update(changes).eq('id', visitId);
  if (error) throw error;
}

export async function deleteVisit(visitId: string) {
  const { error } = await supabase.from('visits').delete().eq('id', visitId);
  if (error) throw error;
}

/** Deletes every visit and visit photo. Community stats drop them on recompute (immediately, by trigger). */
export async function deleteVisitHistory() {
  // RLS limits both to the signed-in user's own rows and files.
  const { error } = await supabase.from('visits').delete().not('id', 'is', null);
  if (error) throw error;
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) return;
  const { data: files } = await supabase.storage.from('visit-photos').list(userId, { limit: 1000 });
  if (files?.length) await supabase.storage.from('visit-photos').remove(files.map((f) => `${userId}/${f.name}`));
}

/** Records a visit through the API (it looks the place up on AMap). */
export async function logVisit(input: {
  placeId: string;
  source: 'navigation' | 'voice_room' | 'manual';
  status?: 'pending' | 'confirmed';
  rating?: number | null;
  tags?: string[];
}): Promise<VisitCardData> {
  const { data } = await supabase.auth.getSession();
  const lang = getTravellerLanguage();
  const res = await fetch('/api/visits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
    body: JSON.stringify({ ...input, lang: lang.code, langName: lang.name }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) throw new Error(body?.error ?? `Could not save the visit (${res.status})`);
  return body.visit as VisitCardData;
}

// ─── "Did you go?" after Navigate ────────────────────────────────────────────
// Tapping Navigate remembers the place on this device. When the app is next opened or brought to the
// foreground, and only if location permission was already granted, we check once whether the user is
// within ARRIVAL_RADIUS_M of it and, if so, create a pending visit. No background tracking.

const NAV_KEY = 'hao.navigations.v1';
type Navigation = { id: string; lat: number; lng: number; at: number };

function readNavigations(): Navigation[] {
  try {
    const list = JSON.parse(globalThis.localStorage?.getItem(NAV_KEY) ?? '[]') as Navigation[];
    const oldest = Date.now() - NAVIGATION_MEMORY_HOURS * 3_600_000;
    return list.filter((n) => n.at > oldest);
  } catch {
    return [];
  }
}

function writeNavigations(list: Navigation[]) {
  try {
    globalThis.localStorage?.setItem(NAV_KEY, JSON.stringify(list.slice(-20)));
  } catch {
    // Not remembered; the user can still log the visit in chat.
  }
}

export function rememberNavigation(place: Place) {
  writeNavigations([...readNavigations().filter((n) => n.id !== place.id), { id: place.id, lat: place.latitude, lng: place.longitude, at: Date.now() }]);
}

let checking = false;

export async function checkArrivals() {
  const pending = readNavigations();
  writeNavigations(pending);
  if (!pending.length || checking) return;
  checking = true;
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    if (!permission.granted) return;
    const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null);
    if (!fix) return;
    const here = wgs84ToGcj02({ latitude: fix.coords.latitude, longitude: fix.coords.longitude });
    const arrived = pending.filter((n) => distanceKm(here, { latitude: n.lat, longitude: n.lng }) * 1000 <= ARRIVAL_RADIUS_M);
    if (!arrived.length) return;
    writeNavigations(pending.filter((n) => !arrived.includes(n)));
    await Promise.allSettled(arrived.map((n) => logVisit({ placeId: n.id, source: 'navigation' })));
  } finally {
    checking = false;
  }
}

/** Checks for arrivals when the app opens and whenever it comes back to the foreground. */
export function useArrivalCheck(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    checkArrivals().catch(() => {});
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkArrivals().catch(() => {});
    });
    return () => sub.remove();
  }, [enabled]);
}
