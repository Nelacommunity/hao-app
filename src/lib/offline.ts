// A copy of the user's own lists on the device (SQLite-backed localStorage), so My Places opens without signal:
// each successful fetch is saved, and a failed one (no network) falls back to the last copy for this account.
import { supabase } from '@/lib/supabase';

const key = (name: string, userId: string) => `hao.offline.${name}:${userId}`;

export async function withOfflineCopy<T>(name: string, fetch: () => Promise<T>): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  try {
    const value = await fetch();
    if (userId) {
      try {
        globalThis.localStorage?.setItem(key(name, userId), JSON.stringify(value));
      } catch {
        // Storage full or unavailable: the online copy still works.
      }
    }
    return value;
  } catch (e) {
    const raw = userId ? globalThis.localStorage?.getItem(key(name, userId)) : null;
    if (raw) return JSON.parse(raw) as T;
    throw e;
  }
}
