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
  /** "device": phones speak the agent's lines with their own TTS (fastest). "server": the AI provider's voice. */
  roomTts: process.env.ROOM_TTS === 'server' ? ('server' as const) : ('device' as const),
  /** Conversation rooms close after this long without a turn. */
  roomIdleMs: process.env.ROOM_IDLE_SECONDS ? int(process.env.ROOM_IDLE_SECONDS, 300) * 1000 : int(process.env.ROOM_IDLE_MINUTES, 5) * 60_000,
};

export const providerEnv = {
  AI_PROVIDER: process.env.AI_PROVIDER,
  QWEN_API_KEY: process.env.QWEN_API_KEY,
  QWEN_BASE_URL: process.env.QWEN_BASE_URL,
  QWEN_MODEL: process.env.QWEN_MODEL,
  QWEN_FAST_MODEL: process.env.QWEN_FAST_MODEL,
  QWEN_ROOM_MODEL: process.env.QWEN_ROOM_MODEL,
  QWEN_AUDIO_MODEL: process.env.QWEN_AUDIO_MODEL,
  QWEN_THINKING: process.env.QWEN_THINKING,
  QWEN_TTS_MODEL: process.env.QWEN_TTS_MODEL,
  QWEN_TTS_VOICE: process.env.QWEN_TTS_VOICE,
};
