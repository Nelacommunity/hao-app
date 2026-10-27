// Per-user sliding-window limiter for AI routes (in-process; good enough for one API server).
const calls = new Map<string, number[]>();
let lastSweep = 0;

export function allow(userId: string, perMinute: number) {
  const now = Date.now();
  // Forget idle users now and then, so the map doesn't grow with every user the server has ever seen.
  if (now - lastSweep > 60_000) {
    lastSweep = now;
    for (const [key, times] of calls) if (now - times[times.length - 1] >= 60_000) calls.delete(key);
  }
  const recent = (calls.get(userId) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= perMinute) return false;
  recent.push(now);
  calls.set(userId, recent);
  return true;
}

export const tooMany = () => Response.json({ error: 'Too many requests. Wait a moment and try again.' }, { status: 429 });
