// Entry point for all AI calls. Feature code asks for a provider here and never talks to a model API directly.
// A new provider is a Transport plus text-to-speech (see agent.ts) and a case below.
import { mockProvider } from './mock';
import { qwenProvider } from './qwen';
import type { AgentProvider } from './types';

export type ProviderEnv = {
  AI_PROVIDER?: string;
  QWEN_API_KEY?: string;
  QWEN_BASE_URL?: string;
  QWEN_MODEL?: string;
  QWEN_FAST_MODEL?: string;
  QWEN_ROOM_MODEL?: string;
  QWEN_AUDIO_MODEL?: string;
  QWEN_THINKING?: string;
  QWEN_TTS_MODEL?: string;
  QWEN_TTS_VOICE?: string;
};

export function createProvider(env: ProviderEnv): AgentProvider {
  const provider = (env.AI_PROVIDER || 'qwen').toLowerCase();
  switch (provider) {
    case 'qwen': {
      if (!env.QWEN_API_KEY) throw new Error('QWEN_API_KEY is not set.');
      return qwenProvider({
        apiKey: env.QWEN_API_KEY,
        baseUrl: env.QWEN_BASE_URL,
        model: env.QWEN_MODEL,
        fastModel: env.QWEN_FAST_MODEL,
        roomModel: env.QWEN_ROOM_MODEL,
        audioModel: env.QWEN_AUDIO_MODEL,
        thinking: env.QWEN_THINKING === 'true',
        ttsModel: env.QWEN_TTS_MODEL,
        ttsVoice: env.QWEN_TTS_VOICE,
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
