// The Places chat: Hao picks one tool per message (search_places, community_picks, log_visit, get_my_places,
// save_place), the server runs it, and Hao answers only from what the tool returned. Replies are { text, cards }.
// Every turn also saves what the user said about themselves ("I love this", "I want to…") to their Hao DNA,
// and the DNA steers vague searches ("somewhere I'd love", "food like home").
import { twinDna } from '@shared/ai/twin';
import type { ShownPlace } from '@shared/ai/types';
import { Countries } from '@shared/places/countries';
import { HIGH_RATING } from '@shared/places/config';

import type { ChatCard, PlaceCardData, PlacesChatResponse, VisitCardData } from '@/data/place-cards';
import { isPlaceId, placeFromRow, type Place } from '@/data/places';
import { authenticate, providerOrError } from '@/lib/server/api';
import { AmapError } from '@/lib/server/amap';
import { memoryContext, remember, toolUses, userClient } from '@/lib/server/memory';
import { localizePlaces, placeLanguage } from '@/lib/server/place-i18n';
import { loadPlaceProfile, upsertPlaces } from '@/lib/server/places-db';
import { allow, tooMany } from '@/lib/server/rate-limit';
import { parseLocation, reasonText, searchPlaces } from '@/lib/server/search-places';
import { captureDna, communityPicks, loadTwin } from '@/lib/server/twin';
import { createVisit, placeByAmapId, placeByName } from '@/lib/server/visits';

type Body = {
  language?: { code?: string; name?: string };
  text?: string;
  history?: { role: string; text: string }[];
  /** Places already shown in the chat (ref is 1-based, id is the AMap id). */
  shown?: (ShownPlace & { id: string })[];
  location?: unknown;
  city?: string | null;
};

const km = (m?: number) => (m === undefined ? '' : m < 1000 ? `${m} m away` : `${(m / 1000).toFixed(1)} km away`);

export async function POST(request: Request) {
  const user = await authenticate(request);
  const db = userClient(request);
  if (!user || !db) return Response.json({ error: 'Please sign in to chat with Hao.' }, { status: 401 });
  if (!allow(`places-chat:${user.id}`, 20)) return tooMany();

  const created = providerOrError();
  if ('error' in created) return created.error;
  const { provider } = created;

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 1000) : '';
  if (!text) return Response.json({ error: 'Send a message' }, { status: 400 });

  const language = { code: String(body.language?.code ?? 'en').slice(0, 32), name: String(body.language?.name ?? 'English').slice(0, 64) };
  const placeLang = placeLanguage(language.code, language.name);
  const history = (body.history ?? []).slice(-10).map((m) => ({ role: m.role === 'hao' ? ('hao' as const) : ('user' as const), text: String(m.text).slice(0, 1500) }));
  const shown = (body.shown ?? [])
    .filter((p) => p && Number.isInteger(p.ref) && isPlaceId(String(p.id)))
    .slice(-20)
    .map((p) => ({ ref: p.ref, id: String(p.id), name: String(p.name).slice(0, 120), nameZh: String(p.nameZh ?? '').slice(0, 120), category: p.category }));
  const location = parseLocation(body.location);
  const city = typeof body.city === 'string' ? body.city.slice(0, 40) : null;

  const [memory, profile, twin] = await Promise.all([memoryContext(request, user.id, text), loadPlaceProfile(db, user.id), loadTwin(db, user.id)]);
  const dna = twin ? twinDna(twin) : '';
  const about = [
    dna ? `Hao DNA:\n${dna}` : profile.nationality ? `From: ${Countries[profile.nationality] ?? profile.nationality}` : '',
    profile.university ? `University: ${profile.university}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const plan = await provider.placesPlan({
      language,
      preferences: profile.preferences,
      about,
      where: location ? `near the user (GPS)${city ? `, in ${city}` : ''}` : city,
      history,
      shown,
      text,
      memories: memory.text,
    });
    const tools = toolUses({ recalled: memory.count, saved: [] });
    const captured = await captureDna(db, user.id, plan.dna);
    if (captured.length) tools.push({ tool: 'dna', items: captured });
    const reply = (results: string) => provider.placesReply({ language, history, text, tool: plan.tool, results, dna });
    const cardsOf = (list: PlaceCardData[]) => list.map((data) => ({ type: data.place.category === 'food' ? 'food' : 'place', data }) as ChatCard);
    const listOf = (list: PlaceCardData[]) =>
      list.map(
        (c, i) =>
          `${i + 1}. ${c.place.name}${c.place.nameZh !== c.place.name ? ` (${c.place.nameZh})` : ''} — ${reasonText(c.reason)}${c.place.distanceM !== undefined ? ` — ${km(c.place.distanceM)}` : ''}${c.place.cost ? ` — about ¥${Math.round(c.place.cost)} per person` : ''}${c.myRating === -1 ? ' — the traveller disliked it before' : c.myRating === 1 ? ' — the traveller liked it before' : ''}`
      );

    /** The place a log_visit or save_place refers to: one shown in the chat, else found by name. */
    const resolvePlace = async (): Promise<Place | null> => {
      const ref = shown.find((p) => p.ref === plan.place_ref);
      const place = ref ? await placeByAmapId(ref.id) : await placeByName(plan.place_name || text, { location, city: plan.near || city });
      return place ? (await localizePlaces([place], placeLang))[0] : null;
    };

    let response: PlacesChatResponse;
    switch (plan.tool) {
      case 'search_places': {
        const result = await searchPlaces(db, user.id, {
          query: plan.query,
          category: plan.category,
          location: plan.near ? null : location,
          city: plan.near || (location ? null : city),
          filters: plan.filters,
          language: placeLang,
        });
        tools.push({ tool: 'search_places', query: plan.query || plan.category || 'places', count: result.cards.length, community: result.community });
        if (result.needsLocation) {
          response = {
            text: 'Share your location and I’ll find places around you. You can also tell me a city or area.',
            cards: [],
            quick_replies: plan.quick_replies,
            tools,
            needs_location: true,
          };
          break;
        }
        const out = await reply(listOf(result.cards).join('\n') || '(no results)');
        response = { text: out.reply, cards: cardsOf(result.cards), quick_replies: out.quick_replies.length ? out.quick_replies : plan.quick_replies, tools };
        break;
      }

      case 'community_picks': {
        // The city's centre, for "in my city" without GPS.
        const cityName = plan.near || city || profile.city;
        const { data: center } = cityName ? await db.from('story_cities').select('lat, lng').ilike('city', cityName).maybeSingle() : { data: null };
        const picks = await communityPicks(db, user.id, {
          category: plan.category,
          scope: plan.scope || 'nearby',
          location: plan.near ? null : location,
          cityCenter: center,
          language: placeLang,
        });
        tools.push({ tool: 'community_picks', count: picks.cards.length, nationality: picks.nationality ?? '' });
        if (picks.empty === 'no_nationality') {
          response = {
            text: 'Tell me where you’re from, and I’ll show you where people from your country go.',
            cards: [],
            quick_replies: [],
            tools,
          };
          break;
        }
        if (picks.empty === 'no_data') {
          // Not enough people from their country have shared visits yet: say so, then the best-rated places instead.
          const result = await searchPlaces(db, user.id, {
            query: plan.query,
            category: plan.category || 'food',
            location: plan.near ? null : location,
            city: plan.near || (location ? null : cityName),
            filters: plan.filters,
            language: placeLang,
          });
          const out = await reply(
            `Not enough people from the traveller's country have shared visits for this yet (groups of 5 or more only). Say that first, kindly. Then these instead:\n${listOf(result.cards).join('\n') || '(no results)'}`
          );
          response = { text: out.reply, cards: cardsOf(result.cards), quick_replies: out.quick_replies, tools, needs_location: result.needsLocation || undefined };
          break;
        }
        const out = await reply(
          `${plan.scope === 'anywhere' ? 'Across China, for a trip or holiday' : 'Near the traveller'}, places people from their country visited and liked:\n${listOf(picks.cards).join('\n')}`
        );
        response = { text: out.reply, cards: cardsOf(picks.cards), quick_replies: out.quick_replies.length ? out.quick_replies : plan.quick_replies, tools };
        break;
      }

      case 'log_visit': {
        const place = await resolvePlace();
        if (!place) {
          response = { text: 'I couldn’t find that place. What is it called, or which area is it in?', cards: [], quick_replies: [], tools };
          break;
        }
        const visit = await createVisit(db, { place, source: 'chat', status: 'pending', rating: plan.rating || null, tags: plan.tags });
        tools.push({ tool: 'log_visit', place: place.name });
        if (memory.db) await remember(memory.db, [{ kind: 'place', text: `Went to ${place.name} (${place.nameZh})` }], 'memory');
        response = {
          text: plan.reply || 'Nice! Did you like it?',
          cards: visit ? [{ type: 'visit_confirm', data: visit }] : [],
          quick_replies: plan.quick_replies,
          tools,
        };
        break;
      }

      case 'get_my_places': {
        let query = db
          .from('visits')
          .select('id, status, rating, tags, note, visited_at, source, places!inner(id, amap_poi_id, name, name_zh, category, lat, lng, address, tags, amap_rating)')
          .eq('status', 'confirmed')
          .order('visited_at', { ascending: false })
          .limit(10);
        if (plan.category === 'food' || plan.category === 'hotel') query = query.eq('places.category', plan.category);
        const { data, error } = await query;
        if (error) throw error;
        const visits: VisitCardData[] = (data ?? []).map((v) => ({
          visitId: v.id,
          place: placeFromRow(v.places),
          status: 'confirmed',
          rating: v.rating,
          tags: v.tags,
          note: v.note,
          visitedAt: v.visited_at,
          source: v.source as VisitCardData['source'],
        }));
        tools.push({ tool: 'my_places', count: visits.length });
        const lines = visits.map(
          (v, i) =>
            `${i + 1}. ${v.place.name} — ${v.visitedAt.slice(0, 10)} — ${v.rating === 1 ? 'liked' : v.rating === -1 ? 'did not like' : 'no rating'}${v.tags.length ? ` — ${v.tags.join(', ')}` : ''}${v.note ? ` — note: ${v.note}` : ''}`
        );
        const out = await reply(lines.join('\n') || '(the traveller has no confirmed visits yet)');
        response = { text: out.reply, cards: visits.map((data) => ({ type: 'visited', data })), quick_replies: out.quick_replies, tools };
        break;
      }

      case 'save_place': {
        const place = await resolvePlace();
        if (!place) {
          response = { text: 'Which place should I save? Tell me its name.', cards: [], quick_replies: [], tools };
          break;
        }
        const [ids, saved] = await Promise.all([upsertPlaces([place]), db.from('saved_places').insert({ place_id: place.id })]);
        // Already on the list is fine.
        if (saved.error && saved.error.code !== '23505') throw saved.error;
        tools.push({ tool: 'save_place', place: place.name });
        const data = {
          place,
          placeId: ids.get(place.id) ?? null,
          reason: place.rating && place.rating >= HIGH_RATING ? { kind: 'rating' as const, rating: place.rating } : { kind: 'nearby' as const },
          saved: true,
          myRating: null,
        };
        response = {
          text: plan.reply || 'Saved to your Want to go list.',
          cards: [{ type: place.category === 'food' ? 'food' : 'place', data }],
          quick_replies: plan.quick_replies,
          tools,
        };
        break;
      }

      default:
        response = { text: plan.reply, cards: [], quick_replies: plan.quick_replies, tools };
    }

    return Response.json(response);
  } catch (e) {
    if (e instanceof AmapError) return Response.json({ error: e.message }, { status: 502 });
    console.error('Places chat error', e);
    return Response.json({ error: 'Hao could not answer right now. Try again.' }, { status: 502 });
  }
}
