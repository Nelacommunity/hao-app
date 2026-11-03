// The digital twin ("Hao DNA") in the app: the chat that builds it, and what Hao detects by itself:
// the home country from the phone's region and the city in China from GPS.
import { useEffect, useRef } from 'react';

import type { LanguageTarget } from '@shared/ai/types';
import { isCountryCode } from '@shared/places/countries';

import { useAuth } from '@/lib/auth';
import { useCurrentLocation, type Coords } from '@/lib/location';
import { supabase } from '@/lib/supabase';

export type TwinMessage = { role: 'user' | 'hao'; text: string; quickReplies?: string[] };
export type TwinReply = { reply: string; quick_replies: string[]; done: boolean; changed: string[]; dna: string };

/**
 * The country the phone is set to (e.g. "en-TZ" → TZ), as a guess of where the user is from. China is
 * ignored: a phone bought or set up here says nothing about its owner. Hao always asks to confirm.
 */
export function deviceCountry(): string | null {
  try {
    const locales = [Intl.DateTimeFormat().resolvedOptions().locale, ...((globalThis.navigator?.languages as string[] | undefined) ?? [])];
    for (const locale of locales) {
      const region = /[-_]([A-Z]{2})(?:$|[-_])/.exec(locale ?? '')?.[1];
      if (region && region !== 'CN' && isCountryCode(region)) return region;
    }
  } catch {
    // No Intl data: nothing to guess from.
  }
  return null;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json) throw new Error(json?.error ?? `Request failed (${res.status})`);
  return json as T;
}

export function askTwin(input: { language: LanguageTarget; text: string; history: TwinMessage[]; detected: { nationality: string | null; city: string | null } }) {
  return post<TwinReply>('/api/twin', {
    language: input.language,
    text: input.text,
    history: input.history.map(({ role, text }) => ({ role, text })),
    detected: input.detected,
  });
}

/** The city in China at these coordinates, in English where Hao knows the name. */
export async function detectCity(coords: Coords): Promise<string | null> {
  const r = await post<{ city: string | null }>('/api/where', { location: { lat: coords.latitude, lng: coords.longitude } });
  return r.city;
}

/**
 * Keeps profiles.city up to date from GPS, once per app session, when location is already allowed
 * (it never asks for permission by itself).
 */
export function useAutoCity() {
  const { profile, updateProfile } = useAuth();
  const { coords } = useCurrentLocation();
  const done = useRef(false);
  const current = profile?.city ?? null;
  const loaded = !!profile;

  useEffect(() => {
    if (!coords || !loaded || done.current) return;
    done.current = true;
    detectCity(coords)
      .then((city) => {
        if (city && city !== current) return updateProfile({ city });
      })
      .catch(() => {
        // Offline or outside China: keep the last city.
      });
  }, [coords, loaded, current, updateProfile]);
}
