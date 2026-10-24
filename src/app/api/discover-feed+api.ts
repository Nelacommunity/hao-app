// Today's Discover stories for the signed-in user, 15–20 of them, ranked by shared/stories/ranking.ts.
// POST { language?: string, location?: { lat, lng } (GCJ-02) } → { day, city, stories }
// Story events (view, complete, skip, …) are written by the app straight to public.story_events in batches.
import { authenticate } from '@/lib/server/api';
import { userClient } from '@/lib/server/memory';
import { allow, tooMany } from '@/lib/server/rate-limit';
import { parseLocation } from '@/lib/server/search-places';
import { discoverFeed } from '@/lib/server/stories';

export async function POST(request: Request) {
  const user = await authenticate(request);
  const db = userClient(request);
  if (!user || !db) return Response.json({ error: 'Please sign in to see Discover.' }, { status: 401 });
  if (!allow(`discover:${user.id}`, 20)) return tooMany();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const language = typeof body.language === 'string' && /^[a-z]{2,3}(-[A-Za-z0-9]+)?$/.test(body.language) ? body.language : 'en';

  try {
    return Response.json(await discoverFeed(db, user.id, { language, location: parseLocation(body.location) }));
  } catch (e) {
    console.error('discover-feed error', e);
    return Response.json({ error: 'Could not load Discover. Try again.' }, { status: 500 });
  }
}
