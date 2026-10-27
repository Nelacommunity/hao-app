import { useCallback, useState } from 'react';

import type { GuideTurn, LanguageTarget, Preferences } from '@shared/ai/types';

import { applyGuideTurn, type GuideState } from '@/lib/guide-state';
import { supabase } from '@/lib/supabase';

export { applyGuideTurn };

export type { GuideChatMessage, GuideState } from '@/lib/guide-state';

export const EMPTY_GUIDE: GuideState = { messages: [], tasks: [], activeTaskId: null };
const LEGACY_KEY = 'hao:guide:v1';

export async function askGuide(input: {
  language: LanguageTarget;
  preferences: Preferences | null;
  city: string | null;
  state: GuideState;
  text: string;
  /** The Discover story the user is asking about ("Ask Hao more"). */
  storyId?: string | null;
}): Promise<GuideTurn> {
  const { data } = await supabase.auth.getSession();
  const res = await fetch('/api/guide', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
    body: JSON.stringify({
      language: input.language,
      preferences: input.preferences,
      city: input.city,
      history: input.state.messages.map(({ role, text }) => ({ role, text })),
      tasks: input.state.tasks,
      activeTaskId: input.state.activeTaskId,
      text: input.text,
      storyId: input.storyId ?? undefined,
    }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) throw new Error(body?.error ?? `Guide request failed (${res.status})`);
  return body as GuideTurn;
}

/** The Guide chat from before chats were saved (one chat on the device), if there is one. */
export function legacyGuideState(): GuideState | null {
  try {
    const raw = globalThis.localStorage?.getItem(LEGACY_KEY);
    if (!raw) return null;
    globalThis.localStorage?.removeItem(LEGACY_KEY);
    return { ...EMPTY_GUIDE, ...(JSON.parse(raw) as GuideState) };
  } catch {
    return null;
  }
}

/** One Guide chat and its checklists; saving is up to the caller (see lib/chats). */
export function useGuideState(initial: GuideState) {
  const [state, setState] = useState<GuideState>(initial);

  const toggleStep = useCallback((taskId: string, index: number) => {
    setState((s) => ({
      ...s,
      activeTaskId: taskId,
      tasks: s.tasks.map((t) =>
        t.id === taskId
          ? { ...t, steps: t.steps.map((step, i) => (i === index ? { ...step, status: step.status === 'done' ? 'todo' : 'done' } : step)) }
          : t
      ),
    }));
  }, []);

  const setActiveTask = useCallback((taskId: string) => setState((s) => ({ ...s, activeTaskId: taskId })), []);
  const removeTask = useCallback(
    (taskId: string) =>
      setState((s) => {
        const tasks = s.tasks.filter((t) => t.id !== taskId);
        return { ...s, tasks, activeTaskId: s.activeTaskId === taskId ? (tasks.at(-1)?.id ?? null) : s.activeTaskId };
      }),
    []
  );
  const clearChat = useCallback(() => setState((s) => ({ ...s, messages: [] })), []);

  return { state, setState, toggleStep, setActiveTask, removeTask, clearChat };
}
