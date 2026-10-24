// The digital twin chat ("Hao DNA"): Hao asks one question at a time and saves what the user answers
// (country, student or tourist, diet, allergies, spice, budget, what they love). The model only proposes
// changes; applyTwinUpdates keeps the valid ones and they're saved as the signed-in user (RLS).
// POST { language, text, history, detected: { nationality, city } } → { reply, quick_replies, done, changed, dna }
import { applyTwinUpdates, TWIN_COLUMNS, twinDna, twinFromRow } from '@shared/ai/twin';
import { isCountryCode } from '@shared/places/countries';

import { authenticate, providerOrError } from '@/lib/server/api';
import { userClient } from '@/lib/server/memory';
import { allow, tooMany } from '@/lib/server/rate-limit';

export async function POST(request: Request) {
  const user = await authenticate(request);
  const db = userClient(request);
  if (!user || !db) return Response.json({ error: 'Please sign in first.' }, { status: 401 });
  if (!allow(`twin:${user.id}`, 30)) return tooMany();

  const created = providerOrError();
  if ('error' in created) return created.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const lang = (body.language ?? {}) as { code?: unknown; name?: unknown };
  const language = { code: String(lang.code ?? 'en').slice(0, 32), name: String(lang.name ?? 'English').slice(0, 64) };
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 1000) : '';
  const history = (Array.isArray(body.history) ? body.history : [])
    .slice(-14)
    .map((m: { role?: unknown; text?: unknown }) => ({ role: m.role === 'hao' ? ('hao' as const) : ('user' as const), text: String(m.text ?? '').slice(0, 1000) }));
  const det = (body.detected ?? {}) as { nationality?: unknown; city?: unknown };
  const detected = {
    nationality: isCountryCode(det.nationality) ? det.nationality : null,
    city: typeof det.city === 'string' && det.city.trim() ? det.city.trim().slice(0, 80) : null,
  };

  const { data: row, error } = await db
    .from('profiles')
    .select(`${TWIN_COLUMNS}, twin_completed_at` as const)
    .eq('id', user.id)
    .single();
  if (error || !row) return Response.json({ error: 'Profile not found.' }, { status: 404 });
  const profile = twinFromRow(row);

  try {
    const turn = await created.provider.twinTurn({ language, profile, detected, history, text });
    const { profile: next, changed } = applyTwinUpdates(profile, text ? turn.updates : {});
    const finished = turn.done && !row.twin_completed_at;
    if (changed.length || finished) {
      const { error: saveError } = await db
        .from('profiles')
        .update({
          nationality: next.nationality,
          home_city: next.home_city,
          city: next.city,
          traveller_type: next.traveller_type,
          preferences: next.preferences,
          loves: next.loves,
          wants: next.wants,
          ...(finished ? { twin_completed_at: new Date().toISOString() } : {}),
        })
        .eq('id', user.id);
      if (saveError) throw saveError;
    }
    return Response.json({ reply: turn.reply, quick_replies: turn.quick_replies, done: turn.done, changed, dna: twinDna(next) });
  } catch (e) {
    console.error('twin error', e);
    return Response.json({ error: 'Hao could not answer right now. Try again.' }, { status: 502 });
  }
}
