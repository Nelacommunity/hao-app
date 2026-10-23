import { useCallback, useEffect, useState } from 'react';

import type { GuideTurn, LanguageTarget, Preferences } from '@shared/ai/types';

import { applyGuideTurn, type GuideState } from '@/lib/guide-state';
import { supabase } from '@/lib/supabase';

export { applyGuideTurn };

export type { GuideChatMessage, GuideState } from '@/lib/guide-state';

const EMPTY: GuideState = { messages: [], tasks: [], activeTaskId: null };
const STORAGE_KEY = 'hao:guide:v1';

export async function askGuide(input: {
  language: LanguageTarget;
  preferences: Preferences | null;
  city: string | null;
  state: GuideState;
  text: string;
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
    }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) throw new Error(body?.error ?? `Guide request failed (${res.status})`);
  return body as GuideTurn;
}

function load(): GuideState {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as GuideState) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

/** Guide chat and tasks, saved on the device so progress survives restarts. */
export function useGuideState() {
  const [state, setState] = useState<GuideState>(load);

  useEffect(() => {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage can be unavailable (private mode); the chat still works in memory.
    }
  }, [state]);

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
