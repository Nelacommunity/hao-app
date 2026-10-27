// What the button on a story's last slide does. Place stories carry the place in the action payload
// (written by the generator from AMap); chat actions open the Hao chat with a prepared message.
import { router } from 'expo-router';

import type { StoryAction } from '@shared/stories/schema';

import { isCategory, type Place } from '@/data/places';
import { tx } from '@/lib/i18n';
import { navigateTo, talkToStaff } from '@/lib/place-actions';
import { setPlaceSaved } from '@/lib/saved-places';
import { logStoryEvent, type Story } from '@/lib/stories';

const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** The place in a navigate / save_place / talk_to_staff payload, or null if it isn't complete. */
export function placeOf(action: StoryAction): Place | null {
  const p = action.payload;
  const lat = Number(p.lat);
  const lng = Number(p.lng);
  const id = str(p.amap_poi_id);
  if (!id || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    id,
    name: str(p.name) || str(p.name_zh),
    nameZh: str(p.name_zh) || str(p.name),
    address: str(p.address),
    addressZh: str(p.address_zh) || str(p.address),
    cityZh: '',
    districtZh: '',
    category: isCategory(p.category) ? p.category : 'landmark',
    typeZh: '',
    latitude: lat,
    longitude: lng,
    tags: [],
    photos: [],
  };
}

export const isPlaceAction = (action: StoryAction) => ['navigate', 'save_place', 'talk_to_staff'].includes(action.kind);

/** Opens the Hao chat in a mode with a message ready to send (and the story as context). */
export function openChatWith(o: { mode: 'places' | 'guide'; ask: string; storyId?: string }) {
  router.navigate({ pathname: '/translate', params: { mode: o.mode, ask: o.ask, story: o.storyId ?? '', at: String(Date.now()) } });
}

/** Prepared chat messages, in English; the chat screen shows them translated. */
export const ASK_MORE = tx('Tell me more about “{title}”.');
export const PRACTICE = tx('Help me practise saying “{zh}” ({pinyin}, “{en}”). When would I use it?');
export const LEARN = tx('Teach me {title} step by step. I’ll tell you when I’ve done each step.');

export async function runStoryAction(story: Story, action: StoryAction, t: (s: string, vars?: Record<string, string | number>) => string) {
  logStoryEvent(story.id, action.kind === 'ask_more' ? 'ask_more' : 'action_tap');
  const place = placeOf(action);
  switch (action.kind) {
    case 'navigate':
      if (place) navigateTo(place);
      return;
    case 'save_place':
      if (place) await setPlaceSaved(place.id, true);
      return;
    case 'talk_to_staff':
      if (place) talkToStaff(place);
      return;
    case 'find_food':
      return openChatWith({ mode: 'places', ask: str(action.payload.query) || story.title, storyId: story.id });
    case 'practice_phrase':
      return openChatWith({
        mode: 'guide',
        ask: t(PRACTICE, { zh: str(action.payload.zh), pinyin: str(action.payload.pinyin), en: str(action.payload.en) }),
        storyId: story.id,
      });
    case 'ask_more':
      return openChatWith({ mode: 'guide', ask: t(ASK_MORE, { title: story.title }), storyId: story.id });
    case 'learn_with_hao':
      // The guide turns the steps into a checklist and coaches the user through them.
      return openChatWith({ mode: 'guide', ask: t(LEARN, { title: str(action.payload.title) || story.title }), storyId: story.id });
  }
}
