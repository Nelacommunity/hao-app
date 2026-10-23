import type { LanguageTarget, MemoryItem, MemoryKind } from '@shared/ai/types';

import { translate, tx } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

export type { MemoryItem, MemoryKind };

export const MemoryKindMeta: Record<MemoryKind, { label: string; icon: 'chatbubble-ellipses' | 'person' | 'heart' | 'location' | 'calendar' | 'bookmark' }> = {
  said: { label: tx('Someone said'), icon: 'chatbubble-ellipses' },
  fact: { label: tx('About you'), icon: 'person' },
  preference: { label: tx('Preference'), icon: 'heart' },
  place: { label: tx('Place'), icon: 'location' },
  plan: { label: tx('Plan'), icon: 'calendar' },
  note: { label: tx('Note'), icon: 'bookmark' },
};

export type MemoryAnswer = { answer: string; cited: MemoryItem[]; saved: number };

export async function askMemory(input: {
  language: LanguageTarget;
  question: string;
  history: { role: 'user' | 'hao'; text: string }[];
}): Promise<MemoryAnswer> {
  const { data } = await supabase.auth.getSession();
  const res = await fetch('/api/memory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
    body: JSON.stringify(input),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) throw new Error(body?.error ?? `Memory request failed (${res.status})`);
  return body as MemoryAnswer;
}

export async function listMemories(search?: string): Promise<MemoryItem[]> {
  const q = search?.trim();
  if (q) {
    const { data, error } = await supabase.rpc('search_memories', { q, max_results: 50 });
    if (error) throw error;
    return (data ?? []).map(({ id, kind, content, happened_at }) => ({ id, kind: kind as MemoryKind, content, happened_at }));
  }
  const { data, error } = await supabase
    .from('memories')
    .select('id, kind, content, happened_at')
    .order('happened_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((m) => ({ ...m, kind: m.kind as MemoryKind }));
}

export async function countMemories(): Promise<number> {
  const { count } = await supabase.from('memories').select('id', { count: 'exact', head: true });
  return count ?? 0;
}

export async function deleteMemory(id: string) {
  const { error } = await supabase.from('memories').delete().eq('id', id);
  if (error) throw error;
}

export async function forgetEverything() {
  // RLS limits the delete to the signed-in user's rows; the filter just satisfies "no unfiltered delete".
  const { error } = await supabase.from('memories').delete().not('id', 'is', null);
  if (error) throw error;
}

export function formatWhen(iso: string) {
  const date = new Date(iso);
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (days <= 0 && new Date().getDate() === date.getDate()) return translate('Today {time}', { time });
  if (days <= 1) return translate('Yesterday {time}', { time });
  if (days < 7) return `${date.toLocaleDateString([], { weekday: 'long' })} ${time}`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
