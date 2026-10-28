import type { LanguageTarget, ShownPlace, ToolUse } from '@shared/ai/types';

import { cardPlaces, type ChatCard, type PlacesChatResponse } from '@/data/place-cards';
import { kindOf } from '@/data/places';
import type { Coords } from '@/lib/location';
import { supabase } from '@/lib/supabase';

/** One message in a Places chat as it is saved (see lib/chats). `photo`: the user sent a photo (not kept, too big). */
export type PlacesMessage = { role: 'user' | 'hao'; text: string; photo?: boolean; cards?: ChatCard[]; quickReplies?: string[]; tools?: ToolUse[]; needsLocation?: boolean };
export type PlacesChatData = { messages: PlacesMessage[] };
export const EMPTY_PLACES_CHAT: PlacesChatData = { messages: [] };

/** Places shown so far, numbered, so "save the second one" or "I went there" can be resolved. */
export function shownPlaces(messages: PlacesMessage[]): (ShownPlace & { id: string })[] {
  const out: (ShownPlace & { id: string })[] = [];
  for (const m of messages) {
    for (const place of (m.cards ?? []).flatMap(cardPlaces)) {
      if (out.some((p) => p.id === place.id)) continue;
      out.push({ ref: out.length + 1, id: place.id, name: place.name, nameZh: place.nameZh, category: kindOf(place.category) });
    }
  }
  return out.slice(-20);
}

export async function askPlaces(input: {
  language: LanguageTarget;
  text: string;
  messages: PlacesMessage[];
  location: Coords | null;
  city: string | null;
  /** A menu or sign to read, base64. */
  image?: { data: string; mimeType: string };
}): Promise<PlacesChatResponse> {
  const { data } = await supabase.auth.getSession();
  const res = await fetch('/api/places-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
    body: JSON.stringify({
      language: input.language,
      text: input.text,
      history: input.messages.map(({ role, text }) => ({ role, text })),
      shown: shownPlaces(input.messages),
      location: input.location ? { lat: input.location.latitude, lng: input.location.longitude } : null,
      city: input.city,
      image: input.image,
    }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) throw new Error(body?.error ?? `Hao could not answer (${res.status})`);
  return body as PlacesChatResponse;
}
