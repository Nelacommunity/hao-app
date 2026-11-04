// Syncs the guide's Markdown sources (knowledge/*.md) into the Supabase guide_* tables, which the Guide,
// the interpreter, the live room and the SOS sheet read at runtime.
//
//   npm run kb:push            # upsert changed rows, delete rows no longer in the files
//   npm run kb:push -- --dry-run
//
// Needs, in the local .env only: EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (service role).
// The API server caches the guide for up to 5 minutes, so changes show up within that time.
import { createClient } from '@supabase/supabase-js';

import { readKnowledge } from './knowledge-md.mjs';

try {
  process.loadEnvFile(new URL('../.env', import.meta.url));
} catch {
  // Variables may come from the shell instead.
}

const dryRun = process.argv.includes('--dry-run');
const kb = readKnowledge();
console.log(`Read ${kb.sections.length} sections, ${kb.embassies.length} embassies, ${kb.topics.length} topics, ${kb.apps.length} apps.`);
if (dryRun) process.exit(0);

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Set EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env');
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const now = new Date().toISOString();

async function sync(table, keyColumn, rows, { same, extra = () => ({}) }) {
  const { data: existing, error } = await db.from(table).select('*');
  if (error) throw new Error(`${table}: ${error.message}`);
  const old = new Map(existing.map((r) => [r[keyColumn], r]));
  const changed = rows.filter((r) => !old.has(r[keyColumn]) || !same(old.get(r[keyColumn]), r));
  const gone = [...old.keys()].filter((k) => !rows.some((r) => r[keyColumn] === k));
  if (changed.length) {
    const { error: e } = await db.from(table).upsert(changed.map((r) => ({ ...r, ...extra(old.get(r[keyColumn]), r), updated_at: now })));
    if (e) throw new Error(`${table}: ${e.message}`);
  }
  if (gone.length) {
    const { error: e } = await db.from(table).delete().in(keyColumn, gone);
    if (e) throw new Error(`${table}: ${e.message}`);
  }
  console.log(`${table}: ${changed.length} written, ${gone.length} removed, ${rows.length - changed.length} unchanged`);
}

const eq = (fields) => (a, b) => fields.every((f) => a[f] === b[f]);

await sync('guide_sections', 'id', kb.sections, { same: eq(['title', 'body', 'kind', 'position']) });
await sync('guide_embassies', 'country', kb.embassies, { same: eq(['phone', 'address', 'region']) });
await sync('guide_apps', 'id', kb.apps, { same: eq(['name', 'store_search', 'position']) });
await sync('guide_topics', 'id', kb.topics, {
  same: eq(['emoji', 'title', 'starter', 'position']),
  // New wording needs translating again.
  extra: (old, row) => (old && old.title === row.title && old.starter === row.starter ? {} : { translations: {} }),
});
