import type { AgentTurn, LogEntry, Speaker } from '@shared/ai/types';

import { supabase } from '@/lib/supabase';

export type { AgentTurn, LogEntry, Speaker } from '@shared/ai/types';

export type AgentRequest = {
  speaker: Speaker;
  travellerLanguage: string;
  log: LogEntry[];
  text?: string;
  audio?: { data: string; mimeType: string };
};

export async function askAgent(req: AgentRequest): Promise<AgentTurn> {
  const { data } = await supabase.auth.getSession();
  const res = await fetch('/api/agent', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session?.access_token ?? ''}`,
    },
    body: JSON.stringify(req),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) {
    throw new Error(body?.error ?? `Agent request failed (${res.status})`);
  }
  return body as AgentTurn;
}

// Turns one agent reply into the log entries shown in the conversation.
export function entriesForTurn(speaker: Speaker, turn: AgentTurn, typed?: string): LogEntry[] {
  const entries: LogEntry[] = [
    speaker === 'traveller'
      ? { kind: 'traveller', text: typed ?? turn.heard }
      : { kind: 'local', text: turn.heard, translation: turn.heard_translation },
  ];
  if (turn.tell_traveller) {
    entries.push({ kind: 'to_traveller', text: turn.tell_traveller, points: turn.key_points ?? [] });
  }
  if (turn.say_to_local_zh) {
    entries.push({
      kind: 'to_local',
      zh: turn.say_to_local_zh,
      pinyin: turn.say_to_local_pinyin,
      gloss: turn.say_to_local_gloss,
    });
  }
  return entries;
}
