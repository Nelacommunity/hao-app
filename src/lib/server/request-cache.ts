// Reads shared within one API request. EAS Hosting runs routes on Cloudflare Workers, which caps the outgoing
// requests (subrequests) one invocation may make: a Places chat turn or a day plan used to read the same profile
// row five times and the same visits and saved lists twice. Keyed by the request's Supabase client, so nothing is
// shared between requests or users, and it is gone with the client.
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';

type Db = SupabaseClient<Database>;

const caches = new WeakMap<object, Map<string, Promise<unknown>>>();

/** `load()` once per `scope` and `key`; a failed load is not kept, so the next caller tries again. */
export function memo<T>(scope: object, key: string, load: () => Promise<T>): Promise<T> {
  let cache = caches.get(scope);
  if (!cache) caches.set(scope, (cache = new Map()));
  let job = cache.get(key) as Promise<T> | undefined;
  if (!job) {
    job = load();
    cache.set(key, job);
    job.catch(() => cache.delete(key));
  }
  return job;
}

/** Drops a cached read after a write, so later reads in the request see the change. */
export function forget(scope: object, key: string) {
  caches.get(scope)?.delete(key);
}

const PROFILE_COLUMNS =
  'memory_enabled, nationality, home_city, city, university, traveller_type, preferences, loves, wants, experiences' as const;

/** The user's profiles row, read once per request for memory, place ranking and their Hao DNA. */
export function profileRow(db: Db, userId: string) {
  return memo(db, `profile:${userId}`, async () => {
    const { data } = await db.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).maybeSingle();
    return data;
  });
}

export const forgetProfile = (db: Db, userId: string) => forget(db, `profile:${userId}`);
