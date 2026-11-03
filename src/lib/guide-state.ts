// Pure state logic for the Guide chat (no React Native imports, so it can be unit-tested in Node).
import type { GuideApp } from '@shared/ai/china-guide';
import type { GuideMessage, GuideTask, GuideTurn, ToolUse } from '@shared/ai/types';
import type { Story } from '@shared/stories/schema';

export type GuideChatMessage = GuideMessage & {
  quickReplies?: string[];
  phrase?: { zh: string; pinyin: string; meaning: string };
  apps?: GuideApp[];
  handoffGoal?: string;
  tools?: ToolUse[];
  /** A Discover story shown as a card under the reply. */
  story?: Story;
};

export type GuideState = { messages: GuideChatMessage[]; tasks: GuideTask[]; activeTaskId: string | null };

/** The chat renders plain text, so drop stray markdown emphasis/headings from the model. */
export const stripMarkdown = (text: string) => text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#{1,6}\s+/gm, '');

/** Folds one agent turn into the chat and the task checklists. */
export function applyGuideTurn(state: GuideState, userText: string, turn: GuideTurn): GuideState {
  let tasks = state.tasks;
  let activeTaskId = state.activeTaskId;

  if (turn.task_id && turn.task_steps.length) {
    const existing = tasks.find((t) => t.id === turn.task_id);
    const steps = turn.task_steps.map((s, i) => ({
      ...s,
      // Keep progress for steps that survived a revised plan.
      status: existing?.steps.find((old) => old.title === s.title)?.status ?? existing?.steps[i]?.status ?? ('todo' as const),
    }));
    const task: GuideTask = { id: turn.task_id, title: turn.task_title || existing?.title || 'Task', steps };
    tasks = existing ? tasks.map((t) => (t.id === task.id ? task : t)) : [...tasks, task];
    activeTaskId = task.id;
  }

  for (const u of turn.step_updates) {
    tasks = tasks.map((t) =>
      t.id === u.task_id && t.steps[u.step_index]
        ? { ...t, steps: t.steps.map((s, i) => (i === u.step_index ? { ...s, status: u.status } : s)) }
        : t
    );
  }

  const hao: GuideChatMessage = {
    role: 'hao',
    text: stripMarkdown(turn.reply),
    quickReplies: turn.quick_replies,
    phrase: turn.phrase_zh ? { zh: turn.phrase_zh, pinyin: turn.phrase_pinyin, meaning: turn.phrase_meaning } : undefined,
    apps: turn.apps,
    handoffGoal: turn.handoff_goal || undefined,
    tools: turn.tools?.length ? turn.tools : undefined,
    story: turn.story,
  };
  const user: GuideChatMessage = { role: 'user', text: userText };
  return { tasks, activeTaskId, messages: [...state.messages, user, hao].slice(-60) };
}
