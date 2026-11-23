// Redis over HTTPS, in the REST protocol Upstash defined: EAS Hosting runs on Cloudflare Workers, which can't keep a
// Redis connection open, and the same code runs in the places-chat Edge Function. Works with Upstash, or with our own
// Redis on the VPS behind serverless-redis-http (scripts/vps/redis/).
//
//   REDIS_REST_URL + REDIS_REST_TOKEN (UPSTASH_REDIS_REST_URL / _TOKEN also work)
//
// Redis is an accelerator, never a dependency: unset, slow or down, every call returns null and the callers fall back
// (rate limits count in memory, caches go to Supabase). After a failure it is skipped for a while, so a dead Redis
// costs one 3 s timeout, not one per request.

type Command = (string | number)[];

// Room for a first HTTPS handshake to the VPS (1.4 s seen through a slow network); later calls reuse the connection.
const TIMEOUT_MS = 3000;
const BACKOFF_MS = 30_000;
// On globalThis, not in this module: each API route is bundled with its own copy of this file, and an outage noticed by
// one route should spare the others the timeout too.
const state = globalThis as { __haoRedisDownUntil?: number };

function config() {
  const url = process.env.REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/+$/, ''), token } : null;
}

export const redisConfigured = () => config() !== null;

/**
 * Runs the commands in one round trip (a pipeline, not a transaction). Returns each command's result in order, or
 * null if Redis isn't configured or couldn't answer. A command Redis rejects comes back as null in its place.
 */
export async function redis(commands: Command[]): Promise<unknown[] | null> {
  const cfg = config();
  if (!cfg || !commands.length || Date.now() < (state.__haoRedisDownUntil ?? 0)) return null;
  try {
    const res = await fetch(`${cfg.url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands.map((c) => c.map(String))),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const out = (await res.json()) as { result?: unknown; error?: string }[];
    return out.map((r) => (r && !r.error ? (r.result ?? null) : null));
  } catch (e) {
    state.__haoRedisDownUntil = Date.now() + BACKOFF_MS;
    console.warn(`[redis] unavailable, skipping it for ${BACKOFF_MS / 1000}s:`, (e as Error).message);
    return null;
  }
}

/** SHA-256 hex of `text`: keys that must not hold the secret itself (access tokens). */
export async function hashKey(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
