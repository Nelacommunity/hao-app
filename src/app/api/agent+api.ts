import type { AgentRequest } from '@/lib/agent';
import type { LogEntry, NewMemory, ToolUse } from '@shared/ai/types';

import { authenticate, providerOrError } from '@/lib/server/api';
import { memoryContext, remember, toolUses } from '@/lib/server/memory';
import { allow, tooMany } from '@/lib/server/rate-limit';

const MAX_AUDIO_BASE64 = 6 * 1024 * 1024;
const LOG_KINDS = new Set(['traveller', 'local', 'to_local', 'to_traveller']);

/** The conversation so far, as the app built it: recent entries only, with every field a bounded string. */
function cleanLog(log: unknown): LogEntry[] {
  if (!Array.isArray(log)) return [];
  const s = (v: unknown) => String(v ?? '').slice(0, 1000);
  return log
    .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object' && LOG_KINDS.has((e as { kind?: unknown }).kind as string))
    .slice(-30)
    .map((e): LogEntry => {
      switch (e.kind) {
        case 'local':
          return { kind: 'local', text: s(e.text), translation: s(e.translation) };
        case 'to_local':
          return { kind: 'to_local', zh: s(e.zh), pinyin: s(e.pinyin), gloss: s(e.gloss) };
        case 'to_traveller':
          return { kind: 'to_traveller', text: s(e.text), points: (Array.isArray(e.points) ? e.points : []).slice(0, 8).map(s) };
        default:
          return { kind: 'traveller', text: s(e.text) };
      }
    });
}

export async function POST(request: Request) {
  const user = await authenticate(request);
  if (!user) {
    return Response.json({ error: 'Please sign in to use the Hao Agent.' }, { status: 401 });
  }
  if (!allow(`agent:${user.id}`, 40)) return tooMany();

  const created = providerOrError();
  if ('error' in created) return created.error;
  const { provider } = created;

  let body: AgentRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 1000) : '';
  const audio =
    body.audio && typeof body.audio.data === 'string' && body.audio.data && body.audio.data.length <= MAX_AUDIO_BASE64
      ? { data: body.audio.data, mimeType: String(body.audio.mimeType ?? '').slice(0, 64) }
      : undefined;
  if (!text && !audio) {
    return Response.json({ error: 'Send either text or audio' }, { status: 400 });
  }
  const speaker = body.speaker === 'local' ? 'local' : 'traveller';

  // What Hao remembers about this user (empty if they turned memory off).
  const memory = await memoryContext(request, user.id, text || undefined);

  try {
    const turn = await provider.soloTurn({
      speaker,
      travellerLanguage: String(body.travellerLanguage ?? 'English').slice(0, 64),
      log: cleanLog(body.log),
      text: text || undefined,
      audio,
      memories: memory.text,
    });

    const toSave: NewMemory[] = memory.db ? [...turn.memories] : [];
    if (memory.db) {
      // Always keep what a local said, so "what did they say about…?" can be answered later.
      if (speaker === 'local' && turn.heard && !toSave.some((m) => m.kind === 'said')) {
        const meaning = turn.heard_translation ? `${turn.heard_translation} (“${turn.heard}”)` : turn.heard;
        toSave.push({ kind: 'said', text: `${turn.goal ? `${turn.goal}: ` : ''}a local said ${meaning}` });
      }
      await remember(memory.db, toSave, 'interpret');
    }
    const tools: ToolUse[] = [];
    if (audio && turn.heard) tools.push({ tool: 'listen', text: turn.heard });
    tools.push(...toolUses({ sources: turn.sources, recalled: memory.count, saved: toSave }));
    if (turn.say_to_local_zh) tools.push({ tool: 'speak', text: turn.say_to_local_zh });
    return Response.json({ ...turn, tools });
  } catch (e) {
    console.error('Agent provider error', e);
    return Response.json({ error: 'The agent could not respond. Try again.' }, { status: 502 });
  }
}
