// The end of a QR-room conversation, when the user chooses Save. Nothing from the conversation is kept
// otherwise (Delete just closes it). Saving summarises it into a chat they can reopen or delete, Hao's
// memory, and their Hao DNA: the title as a saved conversation ("Opening a bank card"), plus anything
// they said about themselves (loves, wants, allergies…).
// POST { lines: [{ speaker, text }], context, summary, language } → { saved, chatId, title, dna }
import type { LanguageTarget } from '@shared/ai/types';
import { RoomContexts, type RoomContext, type RoomSummary } from '@shared/rooms/protocol';
import { cleanName } from '@shared/rooms/realtime';

import type { Json } from '@/lib/database.types';
import { authenticate, providerOrError } from '@/lib/server/api';
import { memoryEnabled, remember, userClient } from '@/lib/server/memory';
import { allow, tooMany } from '@/lib/server/rate-limit';
import { captureDna, loadTwin } from '@/lib/server/twin';

const MAX_EXPERIENCES = 30;

type Body = {
  lines?: { speaker?: unknown; to?: unknown; text?: unknown }[];
  names?: { user?: unknown; local?: unknown };
  context?: RoomContext | null;
  summary?: RoomSummary | null;
  language?: LanguageTarget;
};

export async function POST(request: Request) {
  const user = await authenticate(request);
  const db = userClient(request);
  if (!user || !db) return Response.json({ error: 'Please sign in.' }, { status: 401 });
  if (!allow(`room-finish:${user.id}`, 10)) return tooMany();
  const created = providerOrError();
  if ('error' in created) return created.error;

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const lines = (body.lines ?? [])
    .filter((l) => (l.speaker === 'USER' || l.speaker === 'LOCAL' || l.speaker === 'AGENT') && typeof l.text === 'string' && l.text.trim())
    .slice(-200)
    .map((l) => ({
      speaker: l.speaker as 'USER' | 'LOCAL' | 'AGENT',
      ...(l.to === 'USER' || l.to === 'LOCAL' ? { to: l.to as 'USER' | 'LOCAL' } : {}),
      text: String(l.text).slice(0, 600),
    }));
  if (!lines.length) return Response.json({ saved: false });
  const context = body.context && body.context in RoomContexts ? body.context : null;
  const names = { user: cleanName(body.names?.user) || null, local: cleanName(body.names?.local) || null };
  const language = { code: String(body.language?.code ?? 'en').slice(0, 32), name: String(body.language?.name ?? 'English').slice(0, 64) };

  try {
    const result = await created.provider.summarizeConversation({ language, context: context ? RoomContexts[context].label : null, lines, names });

    // 1. A chat they can reopen (read-only) or delete from the chat list.
    const chatId = crypto.randomUUID();
    const order = body.summary?.items?.length ? body.summary : null;
    const { error } = await db.from('chats').insert({
      id: chatId,
      mode: 'room',
      title: result.title,
      data: { lines, names, summary: result.summary, learned: result.learned, order, context } as unknown as Json,
    });
    if (error) throw error;

    // 2. Hao's memory (when the user has it on): what happened and what they learned.
    if (await memoryEnabled(db, user.id)) {
      const outcome = order ? ` (${order.items.slice(0, 10).join('; ')}${order.total ? `, total ${order.total}` : ''})` : '';
      await remember(db, [{ kind: 'note', text: `${result.title}: ${result.summary}${outcome}`.slice(0, 500) }, ...result.memories], 'interpret');
    }

    // 3. Hao DNA: the conversation itself, and what it showed about them.
    const dna = await captureDna(db, user.id, result.dna);
    const twin = await loadTwin(db, user.id);
    if (twin) {
      const day = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Shanghai' });
      const experiences = [...twin.experiences, `${result.title} · ${day}`].slice(-MAX_EXPERIENCES);
      await db.from('profiles').update({ experiences }).eq('id', user.id);
      dna.unshift(`Saved conversation: ${result.title}`);
    }
    return Response.json({ saved: true, chatId, title: result.title, dna });
  } catch (e) {
    console.error('room finish error', e);
    return Response.json({ error: 'Could not save the conversation. Try again.' }, { status: 502 });
  }
}
