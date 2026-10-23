// Per-user sliding-window limiter for AI routes (in-process; good enough for one API server).
const calls = new Map<string, number[]>();

export function allow(userId: string, perMinute: number) {
  const now = Date.now();
  const recent = (calls.get(userId) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= perMinute) return false;
  recent.push(now);
  calls.set(userId, recent);
  return true;
}

export const tooMany = () => Response.json({ error: 'Too many requests. Wait a moment and try again.' }, { status: 429 });
