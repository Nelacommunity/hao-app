// What the Places chat and search return: Hao's text plus cards ({ text, cards: [{ type, data }] }).
// Shared by the API routes and the app; types only.
import type { ScanItem, ScanResult, ToolUse } from '@shared/ai/types';
import type { Reason } from '@shared/places/ranking';

import type { Place } from '@/data/places';

export type { Reason };

/** A recommended place: the AMap place, its row in public.places and why it's suggested. */
export type PlaceCardData = {
  place: Place;
  /** public.places id; null when the server couldn't store it (then it can't be logged as a visit yet). */
  placeId: string | null;
  reason: Reason;
  saved: boolean;
  /** The user's own rating from a confirmed visit (-1, 0, 1), or null if they haven't been. */
  myRating: number | null;
};

export type VisitStatus = 'pending' | 'confirmed' | 'dismissed';

export type VisitCardData = {
  visitId: string;
  place: Place;
  status: VisitStatus;
  rating: number | null;
  tags: string[];
  note: string | null;
  visitedAt: string;
  source: 'navigation' | 'voice_room' | 'chat' | 'manual';
};

/** Places to show together on one map, in order: a day plan or a trip journal. */
export type MapListData = {
  title: string;
  stops: {
    place: Place;
    /** Day plan: the part of the day ("Lunch"); journal: the date (YYYY-MM-DD). */
    label: string;
    /** Journal: the traveller's rating (-1, 0, 1). */
    rating?: number | null;
    note?: string | null;
  }[];
  /** Day plan: the walk (or ride) from stop to stop, GCJ-02 [lat, lng]. */
  route: { coords: [number, number][]; approximate: boolean } | null;
  distanceM?: number;
  durationS?: number;
};

/** A scanned menu item, plus what the server's own diet check found (pork, allergy:peanut…), in case the model missed it. */
export type MenuItem = ScanItem & { clash?: string };
export type MenuCardData = Omit<ScanResult, 'items'> & { items: MenuItem[] };

export type ChatCard =
  | { type: 'place'; data: PlaceCardData }
  | { type: 'food'; data: PlaceCardData }
  | { type: 'visit_confirm'; data: VisitCardData }
  | { type: 'visited'; data: VisitCardData }
  | { type: 'day_plan'; data: MapListData }
  | { type: 'journal'; data: MapListData }
  | { type: 'menu'; data: MenuCardData };

/** The places a card shows, so "save the second one" can refer to them. */
export function cardPlaces(card: ChatCard): Place[] {
  if (card.type === 'day_plan' || card.type === 'journal') return card.data.stops.map((s) => s.place);
  if (card.type === 'menu') return [];
  return [card.data.place];
}

export type PlacesChatResponse = {
  text: string;
  cards: ChatCard[];
  quick_replies: string[];
  tools: ToolUse[];
  /** The search needed the user's location and the app didn't send one. */
  needs_location?: boolean;
};
