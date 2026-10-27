// What the Places chat and search return: Hao's text plus cards ({ text, cards: [{ type, data }] }).
// Shared by the API routes and the app; types only.
import type { ToolUse } from '@shared/ai/types';
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

export type ChatCard =
  | { type: 'place'; data: PlaceCardData }
  | { type: 'food'; data: PlaceCardData }
  | { type: 'visit_confirm'; data: VisitCardData }
  | { type: 'visited'; data: VisitCardData };

export type PlacesChatResponse = {
  text: string;
  cards: ChatCard[];
  quick_replies: string[];
  tools: ToolUse[];
  /** The search needed the user's location and the app didn't send one. */
  needs_location?: boolean;
};
