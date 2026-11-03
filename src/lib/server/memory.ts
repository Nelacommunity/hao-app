// Server-only memory access for API routes. Queries run as the signed-in user (their JWT),
// so row-level security guarantees nobody can read or write someone else's memories.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { formatMemories } from '@shared/ai/prompts';
import type { MemoryItem, MemoryKind, NewMemory, ToolUse } from '@shared/ai/types';

import type { Database } from '@/lib/database.types';

type Source = 'interpret' | 'guide' | 'memory' | 'manual';

export function userClient(request: Request): SupabaseClient<Database> | null {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;
  const auth = request.headers.get('Authorization');
  if (!url || !key || !auth) return null;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: auth } },
  });
}

export async function memoryEnabled(db: SupabaseClient<Database>, userId: string) {
  const { data } = await db.from('profiles').select('memory_enabled').eq('id', userId).single();
  return data?.memory_enabled ?? true;
}

/** Most relevant memories for `query` plus the most recent ones, without duplicates. */
export async function recallMemories(db: SupabaseClient<Database>, query: string | undefined, limit = 20): Promise<MemoryItem[]> {
  const recentReq = db.from('memories').select('id, kind, content, happened_at').order('happened_at', { ascending: false }).limit(limit);
  const words = query?.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim();
  const relevantReq = words ? db.rpc('search_memories', { q: words.split(/\s+/).slice(0, 12).join(' or '), max_results: limit }) : null;

  const [recent, relevant] = await Promise.all([recentReq, relevantReq]);
  const seen = new Set<string>();
  const out: MemoryItem[] = [];
  for (const row of [...(relevant?.data ?? []), ...(recent.data ?? [])]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push({ id: row.id, kind: row.kind as MemoryKind, content: row.content, happened_at: row.happened_at });
  }
  return out;
}

export async function remember(db: SupabaseClient<Database>, items: NewMemory[], source: Source) {
  const rows = items.filter((m) => m.text.trim()).map((m) => ({ kind: m.kind, content: m.text.trim().slice(0, 1000), source }));
  if (!rows.length) return;
  const { error } = await db.from('memories').insert(rows);
  if (error) console.warn('Could not save memories:', error.message);
}

/** Loads memory context for an agent turn, or nothing if the user turned memory off. */
export async function memoryContext(request: Request, userId: string, query: string | undefined) {
  const db = userClient(request);
  if (!db || !(await memoryEnabled(db, userId))) return { db: null, text: undefined, count: 0 };
  const memories = await recallMemories(db, query);
  return { db, text: formatMemories(memories), count: memories.length };
}

/** The tools shown above a reply: knowledge read, memories recalled and saved. */
export function toolUses(o: { sources?: string[]; recalled: number; saved: NewMemory[] }): ToolUse[] {
  const tools: ToolUse[] = [];
  if (o.recalled) tools.push({ tool: 'recall', count: o.recalled });
  if (o.sources?.length) tools.push({ tool: 'knowledge', items: o.sources });
  const saved = o.saved.map((m) => m.text.trim()).filter(Boolean);
  if (saved.length) tools.push({ tool: 'remember', items: saved });
  return tools;
}
