// What the buttons on a place card do: navigate (and later ask "Did you go?"), talk to staff
// through a Voice Room, share, and the reason line in the user's language.
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { Linking, Platform, Share } from 'react-native';

import { Countries, RegionLabels } from '@shared/places/countries';
import type { ProfileMatch } from '@shared/places/ranking';
import type { RoomContext } from '@shared/rooms/protocol';

import type { Reason } from '@/data/place-cards';
import type { IconName, Place, PlaceCategory } from '@/data/places';
import { openInMaps } from '@/lib/directions';
import { translate, tx, type T } from '@/lib/i18n';
import { getTravellerLanguage } from '@/lib/language-store';
import { cachePlace } from '@/lib/places';
import { setRoomContext, setRoomPlace } from '@/lib/rooms/session';
import { rememberNavigation } from '@/lib/visits';

/**
 * Shows the way there on the Explore map, from the user's position, with Go and Ride from there.
 * Remembers the place, so Hao can ask "Did you go?" later.
 */
export function navigateTo(place: Place) {
  rememberNavigation(place);
  cachePlace(place);
  // `at` makes a second tap on the same place show it again.
  router.navigate({ pathname: '/explore', params: { route: place.id, at: String(Date.now()) } });
}

export type RideApp = 'didi' | 'amap';

const DIDI_STORE = Platform.OS === 'ios' ? 'https://apps.apple.com/app/id554499054' : 'market://details?id=com.sdu.didi.psnger';

/**
 * Opens a ride-hailing app for the trip. Amap opens on the driving route to the place; its route
 * screen has a 打车 (taxi) option for booking it. DiDi has no documented way to pass a
 * destination, so its Chinese name and address are copied first, to paste as the destination.
 */
export async function requestRide(app: RideApp, place: Place) {
  const target = { latitude: place.latitude, longitude: place.longitude, name: place.nameZh || place.name };
  if (app === 'amap') return openInMaps('amap', target, 'car').catch(() => {});
  await Clipboard.setStringAsync([place.nameZh || place.name, place.addressZh].filter(Boolean).join(' ')).catch(() => false);
  return Linking.openURL('diditaxi://').catch(() => Linking.openURL(DIDI_STORE).catch(() => {}));
}

/** What the Voice Room agent should expect at each kind of place. */
const ROOM_CONTEXT: Partial<Record<PlaceCategory, RoomContext>> = { food: 'restaurant', market: 'shop', hotel: 'hotel' };

/** Opens a Voice Room set up for this place; when it ends, Hao asks whether the user went. */
export function talkToStaff(place: Place) {
  setRoomContext(ROOM_CONTEXT[place.category] ?? 'other');
  setRoomPlace({ id: place.id, name: place.name });
  router.push('/room');
}

export function sharePlace(place: Place) {
  const url = `https://uri.amap.com/marker?position=${place.longitude},${place.latitude}&name=${encodeURIComponent(place.nameZh || place.name)}&coordinate=gaode&src=hao`;
  const names = place.name !== place.nameZh ? `${place.name} · ${place.nameZh}` : place.name;
  return Share.share({ message: `${names}\n${place.addressZh || place.address}\n${url}` }).catch(() => {});
}

/** Country name in the user's language when the platform knows it, else English. */
export function countryName(code: string) {
  try {
    const names = new Intl.DisplayNames([getTravellerLanguage().code.replace(/^custom:.*/, 'en'), 'en'], { type: 'region' });
    return names.of(code) ?? Countries[code] ?? code;
  } catch {
    return Countries[code] ?? code;
  }
}

const MATCH_LABELS: Record<ProfileMatch, string> = {
  halal: tx('halal'),
  vegetarian: tx('vegetarian'),
  vegan: tx('vegan'),
  budget: tx('budget'),
  spice: tx('spice'),
};

const joinList = (t: T, items: string[]) => (items.length < 2 ? (items[0] ?? '') : t('{list} and {last}', { list: items.slice(0, -1).join(', '), last: items.at(-1)! }));

/** The one line on a card that says why Hao suggests it, with an icon in front. */
export function reasonLine(reason: Reason, t: T = translate): { icon: IconName; text: string; community: boolean } {
  switch (reason.kind) {
    case 'country':
      return {
        icon: 'people',
        text: t('Liked by {count} people from {country}', { count: reason.count, country: countryName(reason.nationality) }),
        community: true,
      };
    case 'region': {
      const region = t(RegionLabels[reason.region] ?? reason.region);
      return {
        icon: 'earth',
        text: reason.city ? t('Popular with {region} students in {city}', { region, city: reason.city }) : t('Popular with {region} students', { region }),
        community: true,
      };
    }
    case 'profile':
      return { icon: 'sparkles', text: t('Matches your {prefs} preferences', { prefs: joinList(t, reason.matches.map((m) => t(MATCH_LABELS[m]))) }), community: false };
    case 'rating':
      return { icon: 'star', text: t('Highly rated nearby'), community: false };
    case 'nearby':
      return { icon: 'location', text: t('Close to you'), community: false };
  }
}
