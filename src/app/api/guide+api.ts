import { parsePreferences } from '@shared/ai/preferences';
import type { GuideMessage, GuideTask, LanguageTarget } from '@shared/ai/types';

import { authenticate, providerOrError } from '@/lib/server/api';
import { memoryContext, remember } from '@/lib/server/memory';

type GuideRequest = {
  language: LanguageTarget;
  preferences?: unknown;
  city?: string | null;
  history?: GuideMessage[];
  tasks?: GuideTask[];
  activeTaskId?: string | null;
  text: string;
};

export async function POST(request: Request) {
  const user = await authenticate(request);
  if (!user) return Response.json({ error: 'Please sign in to use the Hao Guide.' }, { status: 401 });

  const created = providerOrError();
  if ('error' in created) return created.error;

  let body: GuideRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 1000) : '';
  if (!text) return Response.json({ error: 'Send a message' }, { status: 400 });

  const memory = await memoryContext(request, user.id, text);

  try {
    const turn = await created.provider.guideTurn({
      language: { code: String(body.language?.code ?? 'en').slice(0, 32), name: String(body.language?.name ?? 'English').slice(0, 64) },
      preferences: parsePreferences(body.preferences),
      city: typeof body.city === 'string' ? body.city.slice(0, 40) : null,
      history: (body.history ?? []).slice(-16).map((m) => ({ role: m.role === 'hao' ? 'hao' : 'user', text: String(m.text).slice(0, 2000) })),
      tasks: (body.tasks ?? []).slice(0, 8),
      activeTaskId: body.activeTaskId ?? null,
      text,
      memories: memory.text,
    });
    if (memory.db) await remember(memory.db, turn.memories, 'guide');
    return Response.json(turn);
  } catch (e) {
    console.error('Guide provider error', e);
    return Response.json({ error: 'Hao could not answer right now. Try again.' }, { status: 502 });
  }
}
