const int = (value: string | undefined, fallback: number) => {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const port = int(process.env.PORT, 8787);

export const config = {
  port,
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || `http://localhost:${port}`).replace(/\/+$/, ''),
  supabaseUrl: process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '',
  supabaseKey: process.env.SUPABASE_KEY || process.env.EXPO_PUBLIC_SUPABASE_KEY || '',
  /** AI calls allowed per room per minute (a broadcast chunk every ~5 s is 12/min). */
  aiCallsPerMinute: int(process.env.AI_CALLS_PER_MINUTE, 30),
  /** Hard cap on AI calls over a room's lifetime. */
  aiCallsPerRoom: int(process.env.AI_CALLS_PER_ROOM, 1500),
  maxRoomsPerHost: int(process.env.MAX_ROOMS_PER_HOST, 3),
  maxListeners: int(process.env.MAX_LISTENERS, 200),
  /** "device": phones speak the agent's lines with their own TTS (fastest). "gemini": server-generated voice. */
  roomTts: process.env.ROOM_TTS === 'gemini' ? ('gemini' as const) : ('device' as const),
  /** Conversation rooms close after this long without a turn. */
  roomIdleMs: process.env.ROOM_IDLE_SECONDS ? int(process.env.ROOM_IDLE_SECONDS, 300) * 1000 : int(process.env.ROOM_IDLE_MINUTES, 5) * 60_000,
};

export const providerEnv = {
  AI_PROVIDER: process.env.AI_PROVIDER,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GEMINI_MODEL: process.env.GEMINI_MODEL,
  GEMINI_THINKING_LEVEL: process.env.GEMINI_THINKING_LEVEL,
  GEMINI_FAST_MODEL: process.env.GEMINI_FAST_MODEL,
  GEMINI_FAST_THINKING_LEVEL: process.env.GEMINI_FAST_THINKING_LEVEL,
  GEMINI_TTS_MODEL: process.env.GEMINI_TTS_MODEL,
  GEMINI_TTS_VOICE: process.env.GEMINI_TTS_VOICE,
};
