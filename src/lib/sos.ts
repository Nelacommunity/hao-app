// The SOS sheet's data: China's emergency numbers, the traveller's embassy and where they are, in Chinese, so
// they can read it to an operator (who may not speak English). Everything but the area name is on the device,
// and the last area found is kept, so the sheet still works without signal.
import { findEmbassies, type Embassy } from '@shared/ai/knowledge';
import { Countries } from '@shared/places/countries';

import { tx } from '@/lib/i18n';
import type { Coords } from '@/lib/location';
import { nearestCachedPlace } from '@/lib/places';
import { supabase } from '@/lib/supabase';

/** From the knowledge base (Emergencies and safety). */
export const EMERGENCY_NUMBERS = [
  { number: '110', label: tx('Police'), zh: '警察', icon: 'shield' },
  { number: '120', label: tx('Ambulance'), zh: '急救', icon: 'medkit' },
  { number: '119', label: tx('Fire'), zh: '消防', icon: 'flame' },
  { number: '122', label: tx('Traffic accident'), zh: '交通事故', icon: 'car' },
] as const;

/** Phrases to show or play to people nearby or an operator. */
export const HELP_PHRASES = [
  { zh: '救命！', pinyin: 'Jiùmìng!', en: tx('Help!') },
  { zh: '请报警', pinyin: 'Qǐng bàojǐng', en: tx('Please call the police') },
  { zh: '我需要医生', pinyin: 'Wǒ xūyào yīshēng', en: tx('I need a doctor') },
  { zh: '我的护照丢了', pinyin: 'Wǒ de hùzhào diū le', en: tx('My passport is lost') },
  { zh: '我想联系我的大使馆', pinyin: 'Wǒ xiǎng liánxì wǒ de dàshǐguǎn', en: tx('I want to contact my embassy') },
];

/** The traveller's embassy in Beijing, from their nationality (ISO code). */
export function embassyFor(nationality: string | null | undefined): Embassy | null {
  const country = nationality ? Countries[nationality] : null;
  return country ? (findEmbassies(country, 1)[0] ?? null) : null;
}

/** "From a mobile, dial 010 first": the knowledge base lists Beijing landlines as 010-xxxx xxxx. */
export const dialable = (phone: string) => phone.replace(/[^\d+]/g, '');

export type Whereabouts = {
  /** e.g. 北京市东城区 (from Mapbox), or null when unknown. */
  areaZh: string | null;
  /** The closest place Hao has shown the traveller, as a landmark ("near 故宫"). */
  nearZh: string | null;
  coords: Coords;
  /** What to say, in Chinese. */
  sentence: string;
};

const AREA_KEY = 'hao.sos.area';

function lastArea(): { areaZh: string; coords: Coords } | null {
  try {
    const raw = globalThis.localStorage?.getItem(AREA_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const sentenceOf = (areaZh: string | null, nearZh: string | null, coords: Coords) =>
  `我在${areaZh ?? ''}${nearZh ? `${nearZh}附近` : ''}${areaZh || nearZh ? '。' : ''}我的位置：北纬${coords.latitude.toFixed(5)}，东经${coords.longitude.toFixed(5)}。`;

/** Where the traveller is, in Chinese. Offline it uses the last area it found (if they haven't moved far). */
export async function whereabouts(coords: Coords): Promise<Whereabouts> {
  const near = nearestCachedPlace(coords);
  const nearZh = near ? near.place.nameZh || near.place.name : null;
  let areaZh: string | null = null;
  try {
    const { data } = await supabase.auth.getSession();
    const res = await fetch('/api/where', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
      body: JSON.stringify({ location: { lat: coords.latitude, lng: coords.longitude } }),
      signal: AbortSignal.timeout(6000),
    });
    const json = (await res.json().catch(() => null)) as { areaZh?: string | null } | null;
    areaZh = res.ok ? (json?.areaZh ?? null) : null;
    if (areaZh) globalThis.localStorage?.setItem(AREA_KEY, JSON.stringify({ areaZh, coords }));
  } catch {
    // No signal: fall back to the last area, if it's close by.
  }
  if (!areaZh) {
    const last = lastArea();
    const km = last ? Math.hypot(last.coords.latitude - coords.latitude, last.coords.longitude - coords.longitude) * 111 : Infinity;
    if (last && km < 5) areaZh = last.areaZh;
  }
  return { areaZh, nearZh, coords, sentence: sentenceOf(areaZh, nearZh, coords) };
}
