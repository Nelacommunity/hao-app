// A JSON cache in Redis (src/lib/server/redis.ts), shared by every server instance: EAS Hosting's Workers are short-
// lived, so data cached in memory is fetched again on almost every cold start. Without Redis it just loads.
import { redis } from '@/lib/server/redis';

/** `load()`'s result, from Redis when present (kept `ttlSeconds`). Values must be JSON. Never throws for Redis. */
export async function cached<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
  const hit = await redis([['GET', `c:${key}`]]);
  if (typeof hit?.[0] === 'string') {
    try {
      return JSON.parse(hit[0]) as T;
    } catch {
      // A broken entry: load it again below.
    }
  }
  const value = await load();
  await remember(key, ttlSeconds, value);
  return value;
}

/** Stores `value` under `key` for `ttlSeconds`. */
export async function remember(key: string, ttlSeconds: number, value: unknown) {
  if (value === undefined) return;
  await redis([['SET', `c:${key}`, JSON.stringify(value), 'EX', Math.max(1, Math.round(ttlSeconds))]]);
}

/** The value under `key`, or null. */
export async function recall<T>(key: string): Promise<T | null> {
  const hit = await redis([['GET', `c:${key}`]]);
  if (typeof hit?.[0] !== 'string') return null;
  try {
    return JSON.parse(hit[0]) as T;
  } catch {
    return null;
  }
}

/** Drops `key`, so the next read loads fresh data. */
export async function forget(key: string) {
  await redis([['DEL', `c:${key}`]]);
}
