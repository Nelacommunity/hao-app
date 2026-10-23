// Memory access for conversation rooms. Runs as the host user with their own access token,
// so Supabase row-level security still decides what can be read or written.
import { createClient } from '@supabase/supabase-js';

import { formatMemories } from '../../shared/ai/prompts';
import { parsePreferences } from '../../shared/ai/preferences';
import type { MemoryItem, MemoryKind, NewMemory, Preferences } from '../../shared/ai/types';
import { config } from './config';

function userDb(token: string) {
  if (!config.supabaseUrl || !config.supabaseKey) return null;
  return createClient(config.supabaseUrl, config.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export async function loadProfile(token: string | null, userId: string) {
  const db = token ? userDb(token) : null;
  if (!db) return null;
  const { data } = await db.from('profiles').select('display_name, preferences, memory_enabled').eq('id', userId).single();
  if (!data) return null;
  return {
    name: (data.display_name as string | null) ?? null,
    preferences: parsePreferences(data.preferences) as Preferences | null,
    memoryEnabled: (data.memory_enabled as boolean | null) ?? true,
  };
}

/** Relevant + recent memories as prompt text. Gives up quickly so a slow database never delays a turn much. */
export async function recallText(token: string, query: string, timeoutMs = 600): Promise<string | undefined> {
  const db = userDb(token);
  if (!db) return undefined;
  const work = (async () => {
    const words = query.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).slice(0, 12).join(' or ');
    const [recent, relevant] = await Promise.all([
      db.from('memories').select('id, kind, content, happened_at').order('happened_at', { ascending: false }).limit(12),
      words ? db.rpc('search_memories', { q: words, max_results: 12 }) : Promise.resolve({ data: [] as MemoryItem[] }),
    ]);
    const seen = new Set<string>();
    const items: MemoryItem[] = [];
    for (const m of [...((relevant.data as MemoryItem[] | null) ?? []), ...((recent.data as MemoryItem[] | null) ?? [])]) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      items.push({ id: m.id, kind: m.kind as MemoryKind, content: m.content, happened_at: m.happened_at });
    }
    return formatMemories(items);
  })();
  const timeout = new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), timeoutMs));
  return Promise.race([work, timeout]).catch(() => undefined);
}

export async function saveMemories(token: string, items: NewMemory[]) {
  const db = userDb(token);
  const rows = items.filter((m) => m.text.trim()).map((m) => ({ kind: m.kind, content: m.text.trim().slice(0, 1000), source: 'interpret' }));
  if (!db || !rows.length) return;
  const { error } = await db.from('memories').insert(rows);
  if (error) console.warn('[memory] save failed:', error.message);
}
