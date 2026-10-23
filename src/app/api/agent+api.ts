import type { AgentRequest } from '@/lib/agent';
import type { NewMemory } from '@shared/ai/types';

import { authenticate, providerOrError } from '@/lib/server/api';
import { memoryContext, remember } from '@/lib/server/memory';

export async function POST(request: Request) {
  const user = await authenticate(request);
  if (!user) {
    return Response.json({ error: 'Please sign in to use the Hao Agent.' }, { status: 401 });
  }

  const created = providerOrError();
  if ('error' in created) return created.error;
  const { provider } = created;

  let body: AgentRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body.text?.trim() && !body.audio?.data) {
    return Response.json({ error: 'Send either text or audio' }, { status: 400 });
  }

  // What Hao remembers about this user (empty if they turned memory off).
  const memory = await memoryContext(request, user.id, body.text);

  try {
    const turn = await provider.soloTurn({
      speaker: body.speaker,
      travellerLanguage: body.travellerLanguage,
      log: body.log ?? [],
      text: body.text,
      audio: body.audio,
      memories: memory.text,
    });

    if (memory.db) {
      const toSave: NewMemory[] = [...turn.memories];
      // Always keep what a local said, so "what did they say about…?" can be answered later.
      if (body.speaker === 'local' && turn.heard && !toSave.some((m) => m.kind === 'said')) {
        const meaning = turn.heard_translation ? `${turn.heard_translation} (“${turn.heard}”)` : turn.heard;
        toSave.push({ kind: 'said', text: `${turn.goal ? `${turn.goal}: ` : ''}a local said ${meaning}` });
      }
      await remember(memory.db, toSave, 'interpret');
    }
    return Response.json(turn);
  } catch (e) {
    console.error('Agent provider error', e);
    return Response.json({ error: 'The agent could not respond. Try again.' }, { status: 502 });
  }
}
