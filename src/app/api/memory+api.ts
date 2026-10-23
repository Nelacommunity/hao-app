import type { LanguageTarget } from '@shared/ai/types';

import { authenticate, providerOrError } from '@/lib/server/api';
import { memoryEnabled, recallMemories, remember, userClient } from '@/lib/server/memory';

type MemoryRequest = {
  language: LanguageTarget;
  question: string;
  history?: { role: 'user' | 'hao'; text: string }[];
};

export async function POST(request: Request) {
  const user = await authenticate(request);
  const db = userClient(request);
  if (!user || !db) return Response.json({ error: 'Please sign in to use Hao’s memory.' }, { status: 401 });

  const created = providerOrError();
  if ('error' in created) return created.error;

  let body: MemoryRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const question = typeof body.question === 'string' ? body.question.trim().slice(0, 1000) : '';
  if (!question) return Response.json({ error: 'Ask a question' }, { status: 400 });

  if (!(await memoryEnabled(db, user.id))) {
    return Response.json({ answer: 'Memory is turned off. You can turn it on in Me → Hao’s memory.', cited: [], saved: 0 });
  }

  const memories = await recallMemories(db, question, 30);
  try {
    const turn = await created.provider.memoryTurn({
      language: { code: String(body.language?.code ?? 'en').slice(0, 32), name: String(body.language?.name ?? 'English').slice(0, 64) },
      question,
      memories,
      history: (body.history ?? []).slice(-8).map((m) => ({ role: m.role === 'hao' ? 'hao' : 'user', text: String(m.text).slice(0, 2000) })),
      now: new Date().toISOString(),
    });
    await remember(db, turn.new_memories, 'memory');
    const cited = memories.filter((m) => turn.cited_ids.includes(m.id));
    return Response.json({ answer: turn.answer, cited, saved: turn.new_memories.length });
  } catch (e) {
    console.error('Memory provider error', e);
    return Response.json({ error: 'Hao could not search your memory right now. Try again.' }, { status: 502 });
  }
}
