// plan_day for the Places chat: three sights and two meals ranked for the traveller, put in a sensible
// order (closest next), with the walk (or a ride, for long legs) between stops from Mapbox Directions.
import type { SupabaseClient } from '@supabase/supabase-js';

import type { PlacesFilter } from '@shared/ai/types';

import type { MapListData, PlaceCardData } from '@/data/place-cards';
import type { Place } from '@/data/places';
import type { Database } from '@/lib/database.types';
import { route } from '@/lib/server/mapbox';
import type { PlaceLanguage } from '@/lib/server/place-i18n';
import { searchPlaces } from '@/lib/server/search-places';

type Point = { lat: number; lng: number };

const at = (p: Place): Point => ({ lat: p.latitude, lng: p.longitude });

function metres(a: Point, b: Point) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** Longer legs than this are a taxi or metro ride, not a walk. */
const WALK_M = 2500;

/** Visits `places` from `start`, always going to the closest one not yet visited. */
function closestFirst(places: Place[], start: Point) {
  const left = [...places];
  const out: Place[] = [];
  let here = start;
  while (left.length) {
    left.sort((a, b) => metres(here, at(a)) - metres(here, at(b)));
    const next = left.shift()!;
    out.push(next);
    here = at(next);
  }
  return out;
}

const closestTo = (list: Place[], to: Place, not: Set<string>) =>
  list.filter((p) => !not.has(p.id)).sort((a, b) => metres(at(to), at(a)) - metres(at(to), at(b)))[0];

export type DayPlanResult = { plan: MapListData | null; cards: PlaceCardData[]; needsLocation: boolean };

export async function planDay(
  db: SupabaseClient<Database>,
  userId: string,
  input: { query: string; location: Point | null; city: string | null; filters: PlacesFilter[]; language: PlaceLanguage | null; title: string }
): Promise<DayPlanResult> {
  const where = { location: input.location, city: input.city, language: input.language, limit: 8 };
  const [sights, food] = await Promise.all([
    searchPlaces(db, userId, { ...where, query: input.query, category: 'attraction' }),
    searchPlaces(db, userId, { ...where, query: '', category: 'food', filters: input.filters }),
  ]);
  if (sights.needsLocation || food.needsLocation) return { plan: null, cards: [], needsLocation: true };
  if (!sights.cards.length) return { plan: null, cards: [], needsLocation: false };

  // The best three sights (ranked for the traveller), then the shortest order from where they are.
  const best = sights.cards.slice(0, 3).map((c) => c.place);
  const [first, second, third] = closestFirst(best, input.location ?? at(best[0]));
  const meals = food.cards.map((c) => c.place);
  const used = new Set<string>();
  const lunch = second ? closestTo(meals, second, used) : undefined;
  if (lunch) used.add(lunch.id);
  const dinner = closestTo(meals, third ?? second ?? first, used);

  const stops = [
    { place: first, label: 'Morning' },
    second && { place: second, label: 'Late morning' },
    lunch && { place: lunch, label: 'Lunch' },
    third && { place: third, label: 'Afternoon' },
    dinner && { place: dinner, label: 'Dinner' },
  ].filter((s): s is { place: Place; label: string } => !!s);

  // Street routes leg by leg; a leg Mapbox can't route is drawn straight (and the line shown dashed).
  let approximate = false;
  const legs = await Promise.all(
    stops.slice(1).map(async (stop, i) => {
      const from = at(stops[i].place);
      const to = at(stop.place);
      try {
        return await route(metres(from, to) > WALK_M ? 'car' : 'foot', from, to);
      } catch {
        approximate = true;
        return { coords: [[from.lat, from.lng], [to.lat, to.lng]] as [number, number][], distanceM: metres(from, to), durationS: 0 };
      }
    })
  );

  const byId = new Map([...sights.cards, ...food.cards].map((c) => [c.place.id, c]));
  return {
    plan: {
      title: input.title,
      stops,
      route: { coords: legs.flatMap((l) => l.coords), approximate },
      distanceM: Math.round(legs.reduce((sum, l) => sum + l.distanceM, 0)),
      durationS: Math.round(legs.reduce((sum, l) => sum + l.durationS, 0)),
    },
    cards: stops.map((s) => byId.get(s.place.id)).filter((c): c is PlaceCardData => !!c),
    needsLocation: false,
  };
}
