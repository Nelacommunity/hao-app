// The Hao guide (knowledge sections, embassies, apps, topics) from the guide_* tables, cached in Redis for every server
// instance and in this process. Edit knowledge/*.md and run `npm run kb:push`; servers pick it up within TTL_MS.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { createKnowledge, EMPTY_KNOWLEDGE, type GuideTopic, type Knowledge, type KnowledgeSection } from '@shared/ai/knowledge';

import type { Database } from '@/lib/database.types';
import { adminClient } from '@/lib/server/admin';
import { cached as cachedJson, forget } from '@/lib/server/cache';

const TTL_MS = 5 * 60_000;
const RETRY_MS = 30_000;

export type TopicRow = GuideTopic & { translations: Record<string, { title: string; starter: string }> };
type Loaded = { knowledge: Knowledge; topics: TopicRow[] };

let cached: { value: Loaded; until: number } | null = null;
let loading: Promise<Loaded> | null = null;
let publicClient: SupabaseClient<Database> | null | undefined;

/** The tables are public-read, so the publishable key is enough; the secret key is used when present. */
function readClient(): SupabaseClient<Database> | null {
  const admin = adminClient();
  if (admin) return admin;
  if (publicClient !== undefined) return publicClient;
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;
  publicClient = url && key ? createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false }, db: { retry: false } }) : null;
  return publicClient;
}

/** The rows in Redis (about 100 KB); bump the version when the columns change. */
const ROWS_KEY = 'guide:rows:v1';
type Rows = { sections: KnowledgeSection[]; embassies: { country: string; phone: string; address: string; region: string }[]; apps: { id: string; name: string; store_search: string }[]; topics: TopicRow[] };

async function fetchGuide(): Promise<Loaded> {
  const rows = await cachedJson<Rows>(ROWS_KEY, TTL_MS / 1000, fetchRows);
  return {
    knowledge: createKnowledge({ sections: rows.sections, embassies: rows.embassies, apps: rows.apps }),
    topics: rows.topics,
  };
}

async function fetchRows(): Promise<Rows> {
  const db = readClient();
  if (!db) throw new Error('Supabase is not configured');
  const [sections, embassies, apps, topics] = await Promise.all([
    db.from('guide_sections').select('id, title, body, kind').order('position'),
    db.from('guide_embassies').select('country, phone, address, region').order('country'),
    db.from('guide_apps').select('id, name, store_search').order('position'),
    db.from('guide_topics').select('id, emoji, title, starter, translations').order('position'),
  ]);
  const error = sections.error ?? embassies.error ?? apps.error ?? topics.error;
  if (error) throw new Error(error.message);
  return {
    sections: (sections.data ?? []) as KnowledgeSection[],
    embassies: (embassies.data ?? []) as Rows['embassies'],
    apps: (apps.data ?? []) as Rows['apps'],
    topics: (topics.data ?? []) as TopicRow[],
  };
}

async function load(): Promise<Loaded> {
  if (cached && cached.until > Date.now()) return cached.value;
  loading ??= fetchGuide()
    .then((value) => {
      cached = { value, until: Date.now() + TTL_MS };
      return value;
    })
    .catch((e) => {
      console.error('[guide] could not load the guide from the database', e);
      // Keep serving the last good copy; try again soon.
      const value = cached?.value ?? { knowledge: EMPTY_KNOWLEDGE, topics: [] };
      cached = { value, until: Date.now() + RETRY_MS };
      return value;
    })
    .finally(() => {
      loading = null;
    });
  // A stale copy answers right away while the refresh runs.
  return cached?.value ?? loading;
}

/** The knowledge base the agents search, plus the guide's apps. Never throws. */
export async function loadKnowledge(): Promise<Knowledge> {
  return (await load()).knowledge;
}

/** The Guide's topic chips with their stored translations. Never throws. */
export async function loadTopics(): Promise<TopicRow[]> {
  return (await load()).topics;
}

/** Keeps freshly saved translations in the cached copy; other instances reload them from the database. */
export async function rememberTopicTranslations(lang: string, byId: Record<string, { title: string; starter: string }>) {
  for (const topic of cached?.value.topics ?? []) {
    if (byId[topic.id]) topic.translations = { ...topic.translations, [lang]: byId[topic.id] };
  }
  await forget(ROWS_KEY);
}
