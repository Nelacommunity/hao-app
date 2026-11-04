// Helpers for Expo Router API routes only (runs on the server, never bundled into the app).
import { createClient } from '@supabase/supabase-js';

import { createProvider } from '@shared/ai';
import type { AgentProvider } from '@shared/ai/types';

type AuthUser = NonNullable<Awaited<ReturnType<ReturnType<typeof createClient>['auth']['getUser']>>['data']['user']>;

// Tokens Supabase confirmed recently, so live-room turns don't pay an auth round trip every time.
const verified = new Map<string, { user: AuthUser; until: number }>();
const VERIFY_TTL_MS = 60_000;

/** The JWT's own expiry (ms); 0 if unreadable, which disables caching for it. */
function tokenExpiry(token: string) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
    return (payload.exp ?? 0) * 1000;
  } catch {
    return 0;
  }
}

/** Only signed-in Hao users can spend AI quota. */
export async function authenticate(request: Request) {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!url || !key || !token) return null;
  const now = Date.now();
  const cached = verified.get(token);
  if (cached && cached.until > now) return cached.user;

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  for (const [t, v] of verified) if (v.until <= now) verified.delete(t);
  verified.set(token, { user: data.user, until: Math.min(now + VERIFY_TTL_MS, tokenExpiry(token)) });
  return data.user;
}

export function providerOrError(): { provider: AgentProvider } | { error: Response } {
  try {
    return {
      provider: createProvider({
        AI_PROVIDER: process.env.AI_PROVIDER,
        QWEN_API_KEY: process.env.QWEN_API_KEY,
        QWEN_BASE_URL: process.env.QWEN_BASE_URL,
        QWEN_MODEL: process.env.QWEN_MODEL,
        QWEN_FAST_MODEL: process.env.QWEN_FAST_MODEL,
        QWEN_ROOM_MODEL: process.env.QWEN_ROOM_MODEL,
        QWEN_AUDIO_MODEL: process.env.QWEN_AUDIO_MODEL,
        QWEN_THINKING: process.env.QWEN_THINKING,
      }),
    };
  } catch (e) {
    return { error: Response.json({ error: `${(e as Error).message} Add it to .env and restart Expo.` }, { status: 500 }) };
  }
}

/** Request header an app sends when it can read a kept-alive response (see keepAlive). */
export const KEEP_ALIVE_HEADER = 'x-hao-keep-alive';

/**
 * For slow AI routes: proxies in front of the server (the Expo dev tunnel cuts requests after ~30 s with a 504;
 * Cloudflare after 100 s) close a request that sends nothing for too long. When the app asked for it with
 * KEEP_ALIVE_HEADER, this answers 200 at once, sends a newline every few seconds while `work` runs, then the JSON
 * body `work` returned. JSON parsers skip the leading whitespace; a failed request carries its message as
 * `{ error }` in the body (the status is already sent), which the app checks for. Other callers get `work` as is.
 */
export async function keepAlive(request: Request, work: () => Promise<Response>): Promise<Response> {
  if (request.headers.get(KEEP_ALIVE_HEADER) !== '1') return work();
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const timer = setInterval(() => controller.enqueue(encoder.encode('\n')), 5000);
      try {
        const res = await work();
        const body = await res.text();
        controller.enqueue(encoder.encode(res.ok ? body : JSON.stringify({ error: errorOf(body, res.status), status: res.status })));
      } catch (e) {
        console.error('[keep-alive] request failed', e);
        controller.enqueue(encoder.encode(JSON.stringify({ error: 'Hao could not answer right now. Try again.', status: 500 })));
      } finally {
        clearInterval(timer);
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

function errorOf(body: string, status: number) {
  try {
    const parsed = JSON.parse(body) as { error?: unknown };
    if (typeof parsed.error === 'string') return parsed.error;
  } catch {
    // Not JSON: fall through.
  }
  return `Hao could not answer (${status})`;
}
