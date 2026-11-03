// Story review for admins (profiles.is_admin): drafts to approve or reject, and running generation now.
// GET → { drafts }
// POST { id, decision: 'approve' | 'reject' } → { ok }
// POST { generate: true, cities?: string[] } → the generate-stories result
// Stories are written with the service role only; this route checks the caller is an admin first.
import { adminClient } from '@/lib/server/admin';
import { authenticate } from '@/lib/server/api';
import { userClient } from '@/lib/server/memory';

async function admin(request: Request) {
  const user = await authenticate(request);
  const db = userClient(request);
  if (!user || !db) return { error: Response.json({ error: 'Please sign in.' }, { status: 401 }) };
  const { data } = await db.rpc('is_admin');
  if (!data) return { error: Response.json({ error: 'Admins only.' }, { status: 403 }) };
  const service = adminClient();
  if (!service) return { error: Response.json({ error: 'SUPABASE_SECRET_KEY is not set on the server.' }, { status: 500 }) };
  return { user, service };
}

export async function GET(request: Request) {
  const a = await admin(request);
  if ('error' in a) return a.error;
  const { data, error } = await a.service
    .from('stories')
    .select('id, type, city, nationality, audience, language, title, slides, action, topics, sources, created_at, generated_by_model, attribution, interaction')
    .eq('status', 'draft')
    .order('created_at', { ascending: true })
    .limit(100);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ drafts: data });
}

export async function POST(request: Request) {
  const a = await admin(request);
  if ('error' in a) return a.error;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (body.generate === true) {
    // On-demand run: the Edge Function checks the admin token again itself.
    const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/generate-stories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: request.headers.get('Authorization') ?? '' },
      body: JSON.stringify({ cities: Array.isArray(body.cities) ? body.cities : undefined }),
    });
    const result = await res.json().catch(() => ({ error: `generate-stories failed (${res.status})` }));
    return Response.json(result, { status: res.ok ? 200 : 502 });
  }

  const id = String(body.id ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id) || (body.decision !== 'approve' && body.decision !== 'reject')) {
    return Response.json({ error: 'Send { id, decision: approve | reject }' }, { status: 400 });
  }
  const { error } = await a.service
    .from('stories')
    .update({ status: body.decision === 'approve' ? 'approved' : 'rejected', reviewed_by: a.user.id, reviewed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'draft');
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
