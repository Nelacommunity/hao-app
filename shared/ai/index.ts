// Entry point for all AI calls. Feature code asks for a provider here and never talks to a model API directly.
// To add Qwen or DeepSeek later: implement AgentProvider in a new file and add a case below.
import { geminiProvider, type ThinkingLevel } from './gemini';
import { mockProvider } from './mock';
import type { AgentProvider } from './types';

export type ProviderEnv = {
  AI_PROVIDER?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  GEMINI_THINKING_LEVEL?: string;
  GEMINI_FAST_MODEL?: string;
  GEMINI_FAST_THINKING_LEVEL?: string;
  GEMINI_ROOM_MODEL?: string;
  GEMINI_ROOM_THINKING_LEVEL?: string;
  GEMINI_TTS_MODEL?: string;
  GEMINI_TTS_VOICE?: string;
};

const LEVELS: ThinkingLevel[] = ['minimal', 'low', 'medium', 'high', ''];
const level = (v: string | undefined) => (v !== undefined && (LEVELS as string[]).includes(v) ? (v as ThinkingLevel) : undefined);

export function createProvider(env: ProviderEnv): AgentProvider {
  const provider = (env.AI_PROVIDER || 'gemini').toLowerCase();
  switch (provider) {
    case 'gemini': {
      if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set.');
      return geminiProvider({
        apiKey: env.GEMINI_API_KEY,
        model: env.GEMINI_MODEL,
        thinkingLevel: level(env.GEMINI_THINKING_LEVEL),
        fastModel: env.GEMINI_FAST_MODEL,
        fastThinkingLevel: level(env.GEMINI_FAST_THINKING_LEVEL),
        roomModel: env.GEMINI_ROOM_MODEL,
        roomThinkingLevel: level(env.GEMINI_ROOM_THINKING_LEVEL),
        ttsModel: env.GEMINI_TTS_MODEL,
        ttsVoice: env.GEMINI_TTS_VOICE,
      });
    }
    case 'mock':
      return mockProvider();
    default:
      throw new Error(`Unknown AI_PROVIDER "${provider}".`);
  }
}

export * from './types';
export * from './preferences';
