// Rate limits shared by every server instance, in Redis (src/lib/server/redis.ts). EAS Hosting runs many short-lived
// Workers, so a count kept in memory only limits one of them; Redis counts for all. Without Redis (unset or down) it
// falls back to counting in this process, as before.
import { redis } from '@/lib/server/redis';

const calls = new Map<string, number[]>();
let lastSweep = 0;

function allowInMemory(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  // Forget idle keys now and then, so the map doesn't grow with every user the server has ever seen.
  if (now - lastSweep > 60_000) {
    lastSweep = now;
    for (const [k, times] of calls) if (now - times[times.length - 1] >= 86_400_000) calls.delete(k);
  }
  const recent = (calls.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) return false;
  recent.push(now);
  calls.set(key, recent);
  return true;
}

/**
 * True if `key` (e.g. `guide:<userId>` or `ip:guide-content:<ip>`) may make another call: at most `limit` per
 * `windowSeconds` (a fixed window, one Redis round trip).
 */
export async function allow(key: string, limit: number, windowSeconds = 60): Promise<boolean> {
  const window = Math.floor(Date.now() / 1000 / windowSeconds);
  const k = `rl:${key}:${window}`;
  // SET NX starts the window with its expiry (works on every Redis version), INCR counts this call.
  const out = await redis([
    ['SET', k, 0, 'EX', windowSeconds, 'NX'],
    ['INCR', k],
  ]);
  const count = out?.[1];
  if (typeof count === 'number') return count <= limit;
  return allowInMemory(key, limit, windowSeconds * 1000);
}

/**
 * The caller's IP, for limits on routes that work without signing in, or null if the request doesn't say. EAS Hosting
 * (Cloudflare) sets cf-connecting-ip; behind other proxies the first x-forwarded-for entry is the client.
 */
export function clientIp(request: Request): string | null {
  const ip =
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip');
  return ip ? ip.slice(0, 64) : null;
}

/**
 * `allow` per IP for public routes. Without a client IP there's nothing to tell callers apart by, so it lets the call
 * through rather than putting everyone in one shared bucket.
 */
export async function allowIp(request: Request, route: string, limit: number, windowSeconds = 60) {
  const ip = clientIp(request);
  return ip ? allow(`ip:${route}:${ip}`, limit, windowSeconds) : true;
}

export const tooMany = () =>
  Response.json({ error: 'Too many requests. Wait a moment and try again.' }, { status: 429, headers: { 'Retry-After': '60' } });
