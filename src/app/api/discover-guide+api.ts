// Discover's voice guide: Hao explains a story, an AMap place or a phrase, as a short spoken story in the
// traveller's language. The app reads the text aloud.
// POST { item, language: { code, name } } → { text }
//   item: { kind: 'story', id } | { kind: 'place', place: {…} } | { kind: 'phrase', phrase: { zh, pinyin, en } }
import { authenticate, providerOrError } from '@/lib/server/api';
import { userClient } from '@/lib/server/memory';
import { allow, tooMany } from '@/lib/server/rate-limit';
import { describeStory, storyContext } from '@/lib/server/stories';

type PlaceInput = { id?: unknown; name?: unknown; nameZh?: unknown; type?: unknown; typeZh?: unknown; cityZh?: unknown; districtZh?: unknown; address?: unknown; rating?: unknown; tags?: unknown };

// The same item explained in the same language is the same text: keep recent ones (per server instance).
const cache = new Map<string, string>();
const CACHE_MAX = 500;

const clip = (v: unknown, max = 200) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export async function POST(request: Request) {
  const user = await authenticate(request);
  const db = userClient(request);
  if (!user || !db) return Response.json({ error: 'Please sign in to hear Hao.' }, { status: 401 });
  if (!allow(`discover-guide:${user.id}`, 30)) return tooMany();
  const created = providerOrError();
  if ('error' in created) return created.error;

  let body: { item?: { kind?: unknown; id?: unknown; place?: PlaceInput; phrase?: { zh?: unknown; pinyin?: unknown; en?: unknown } }; language?: { code?: unknown; name?: unknown } };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const language = { code: clip(body.language?.code, 32) || 'en', name: clip(body.language?.name, 64) || 'English' };
  const item = body.item;

  // What Hao explains: stories from the database (only approved ones, by RLS), places and phrases from the request.
  let key = '';
  let title = '';
  let facts = '';
  if (item?.kind === 'story' && typeof item.id === 'string') {
    const ctx = await storyContext(db, item.id).catch(() => null);
    if (!ctx) return Response.json({ error: 'Story not found' }, { status: 404 });
    key = `story:${item.id}`;
    title = `A Discover story: ${ctx.story.title}`;
    facts = describeStory(ctx);
  } else if (item?.kind === 'place' && item.place) {
    const p = item.place;
    const name = clip(p.name, 120);
    if (!name) return Response.json({ error: 'Missing place' }, { status: 400 });
    key = `place:${clip(p.id, 40) || name}`;
    title = `A place in China from the AMap map: ${name}${clip(p.nameZh) ? ` (${clip(p.nameZh)})` : ''}`;
    const tags = Array.isArray(p.tags) ? p.tags.map((t) => clip(t, 40)).filter(Boolean).slice(0, 8) : [];
    facts = [
      `Type: ${clip(p.type) || clip(p.typeZh)}`,
      `Where: ${[clip(p.districtZh), clip(p.cityZh)].filter(Boolean).join(', ')} · ${clip(p.address)}`,
      typeof p.rating === 'number' ? `AMap rating: ${p.rating}/5` : '',
      tags.length ? `Known for: ${tags.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  } else if (item?.kind === 'phrase' && item.phrase) {
    const zh = clip(item.phrase.zh, 60);
    if (!zh) return Response.json({ error: 'Missing phrase' }, { status: 400 });
    key = `phrase:${zh}`;
    title = `Chinese phrase of the day: ${zh}`;
    facts = `Pinyin: ${clip(item.phrase.pinyin, 80)}\nMeaning: ${clip(item.phrase.en, 120)}\nExplain when and how people use it, and how to say it.`;
  } else {
    return Response.json({ error: 'Invalid item' }, { status: 400 });
  }

  const cacheKey = `${language.code}|${key}`;
  const hit = cache.get(cacheKey);
  if (hit) return Response.json({ text: hit });

  try {
    const { text } = await created.provider.explain({ title, facts, language });
    if (!text) throw new Error('empty');
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
    cache.set(cacheKey, text);
    return Response.json({ text });
  } catch (e) {
    console.error('discover-guide error', e);
    return Response.json({ error: 'Hao could not explain this right now. Try again.' }, { status: 502 });
  }
}
