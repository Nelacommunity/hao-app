import { RoomContexts, type RoomContext, type RoomSummary } from '@shared/rooms/protocol';

import { authenticate } from '@/lib/server/api';
import { memoryEnabled, remember, userClient } from '@/lib/server/memory';

/** When a conversation ends, keep its outcome (e.g. the order) in the user's memory. */
export async function POST(request: Request) {
  const user = await authenticate(request);
  const db = userClient(request);
  if (!user || !db) return Response.json({ error: 'Please sign in.' }, { status: 401 });
  let body: { summary: RoomSummary | null; context: RoomContext | null };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const s = body.summary;
  if (!s?.items?.length || !(await memoryEnabled(db, user.id))) return Response.json({ saved: false });
  const where = body.context && body.context in RoomContexts ? `${RoomContexts[body.context].label}: ` : '';
  const text = `${where}${String(s.title).slice(0, 60)} – ${s.items.slice(0, 20).map(String).join('; ')}${s.total ? ` (total ${String(s.total).slice(0, 40)})` : ''}`;
  await remember(db, [{ kind: 'note', text }], 'interpret');
  return Response.json({ saved: true });
}
