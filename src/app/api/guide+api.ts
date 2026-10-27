import { parsePreferences } from '@shared/ai/preferences';
import type { GuideMessage, GuideTask, LanguageTarget } from '@shared/ai/types';

import { authenticate, providerOrError } from '@/lib/server/api';
import { memoryContext, remember, toolUses, userClient } from '@/lib/server/memory';
import { allow, tooMany } from '@/lib/server/rate-limit';
import { describeStory, relatedStory, storyContext } from '@/lib/server/stories';
import { captureDna } from '@/lib/server/twin';

type GuideRequest = {
  language: LanguageTarget;
  preferences?: unknown;
  city?: string | null;
  history?: GuideMessage[];
  tasks?: GuideTask[];
  activeTaskId?: string | null;
  text: string;
  /** "Ask Hao more" on a Discover story: its facts and sources become context. */
  storyId?: string;
};

const STEP_STATUSES = new Set(['todo', 'doing', 'done']);

/** The user's checklists as the app sent them: a few tasks, each field a bounded string. */
function cleanTasks(tasks: unknown): GuideTask[] {
  if (!Array.isArray(tasks)) return [];
  const s = (v: unknown, max: number) => String(v ?? '').slice(0, max);
  return tasks
    .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
    .slice(0, 8)
    .map((t) => ({
      id: s(t.id, 64),
      title: s(t.title, 200),
      steps: (Array.isArray(t.steps) ? t.steps : []).slice(0, 20).map((step: Record<string, unknown> | null) => ({
        title: s(step?.title, 200),
        detail: s(step?.detail, 1000),
        status: (STEP_STATUSES.has(step?.status as string) ? step?.status : 'todo') as GuideTask['steps'][number]['status'],
      })),
    }));
}

export async function POST(request: Request) {
  const user = await authenticate(request);
  if (!user) return Response.json({ error: 'Please sign in to use the Hao Guide.' }, { status: 401 });
  if (!allow(`guide:${user.id}`, 20)) return tooMany();

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

  const tasks = cleanTasks(body.tasks);
  const db = userClient(request);
  const language = { code: String(body.language?.code ?? 'en').slice(0, 32), name: String(body.language?.name ?? 'English').slice(0, 64) };
  const city = typeof body.city === 'string' ? body.city.slice(0, 40) : null;
  const [memory, story] = await Promise.all([
    memoryContext(request, user.id, text),
    db && typeof body.storyId === 'string' && body.storyId ? storyContext(db, body.storyId).catch(() => null) : null,
  ]);

  try {
    const turn = await created.provider.guideTurn({
      language,
      preferences: parsePreferences(body.preferences),
      city,
      history: (body.history ?? []).slice(-16).map((m) => ({ role: m.role === 'hao' ? 'hao' : 'user', text: String(m.text).slice(0, 2000) })),
      tasks,
      activeTaskId: typeof body.activeTaskId === 'string' ? body.activeTaskId.slice(0, 64) : null,
      text,
      memories: memory.text,
      story: story ? describeStory(story) : undefined,
    });
    if (memory.db) await remember(memory.db, turn.memories, 'guide');
    // What the user said about themselves ("I love…", "I want to…") goes into their Hao DNA.
    const captured = db ? await captureDna(db, user.id, turn.dna) : [];
    const tools = toolUses({ sources: turn.sources, recalled: memory.count, saved: memory.db ? turn.memories : [] });
    if (turn.task_id && turn.task_steps.length) {
      const created = !tasks.some((t) => t.id === turn.task_id);
      tools.push({ tool: 'checklist', title: turn.task_title || 'Task', created });
    } else if (turn.step_updates.length) {
      const task = tasks.find((t) => t.id === turn.step_updates[0].task_id);
      if (task) tools.push({ tool: 'checklist', title: task.title, created: false });
    }
    // A story about what was asked ("What's this festival?") is shown as a card, unless one is already open.
    const card = story || !db ? null : await relatedStory(db, text, { city, language: language.code.split('-')[0] }).catch(() => null);
    if (story) tools.push({ tool: 'story', title: story.story.title });
    if (captured.length) tools.push({ tool: 'dna', items: captured });
    return Response.json({ ...turn, tools, story: card ?? undefined });
  } catch (e) {
    console.error('Guide provider error', e);
    return Response.json({ error: 'Hao could not answer right now. Try again.' }, { status: 502 });
  }
}
