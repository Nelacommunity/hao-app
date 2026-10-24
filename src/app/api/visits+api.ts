// Records a visit for the signed-in user: after navigating to a place, at the end of a Voice Room
// session, or added by hand. Reading, confirming and deleting visits happen in the app with supabase-js.
// POST { placeId: AMap POI id, source: navigation|voice_room|manual, status?: pending|confirmed, rating?, tags?, note?, lang?, langName? }
//   → { visit: VisitCardData }
import { authenticate } from '@/lib/server/api';
import { AmapError } from '@/lib/server/amap';
import { userClient } from '@/lib/server/memory';
import { localizePlaces, placeLanguage } from '@/lib/server/place-i18n';
import { allow, tooMany } from '@/lib/server/rate-limit';
import { createVisit, isVisitSource, placeByAmapId } from '@/lib/server/visits';

export async function POST(request: Request) {
  const user = await authenticate(request);
  const db = userClient(request);
  if (!user || !db) return Response.json({ error: 'Please sign in first.' }, { status: 401 });
  if (!allow(`visits:${user.id}`, 30)) return tooMany();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!isVisitSource(body.source) || body.source === 'chat') return Response.json({ error: 'Invalid source' }, { status: 400 });

  try {
    const place = await placeByAmapId(String(body.placeId ?? ''));
    if (!place) return Response.json({ error: 'Unknown place' }, { status: 404 });
    const [localized] = await localizePlaces([place], placeLanguage(body.lang, body.langName));
    const visit = await createVisit(db, {
      place: localized,
      source: body.source,
      // Only something the user did on purpose counts as confirmed; automatic captures ask first.
      status: body.source === 'manual' && body.status === 'confirmed' ? 'confirmed' : 'pending',
      rating: typeof body.rating === 'number' ? body.rating : null,
      tags: body.tags as string[],
      note: typeof body.note === 'string' ? body.note : null,
    });
    return Response.json({ visit });
  } catch (e) {
    if (e instanceof AmapError) return Response.json({ error: e.message }, { status: 502 });
    console.error('visits error', e);
    return Response.json({ error: 'Could not save the visit. Try again.' }, { status: 500 });
  }
}
