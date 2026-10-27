// Qwen transport for the shared agent (agent.ts), through Alibaba Model Studio's OpenAI-compatible API.
// Text goes to a Qwen text model with a strict JSON schema. Audio goes to a Qwen omni model, which only has
// JSON mode, so the schema is spelled out in the prompt and agent.ts validates the reply.
import { agentProvider, bytesToBase64, fetchWithRetry, normalizeMime, readSse, type Part, type Tier } from './agent';
import type { JsonSchema } from './prompts';
import { ProviderError, type AgentProvider } from './types';

export type QwenConfig = {
  apiKey: string;
  /** OpenAI-compatible base URL of the key's region or workspace. Default: Singapore. */
  baseUrl?: string;
  /** Agent turns. */
  model?: string;
  /** Short translations. */
  fastModel?: string;
  /** Live room turns given as text. Defaults to `model`. */
  roomModel?: string;
  /** Anything with audio in it (speech-to-text, captions, voice turns). */
  audioModel?: string;
  /** Let the agent-turn model think before answering (better answers, slower). Off by default. */
  thinking?: boolean;
  /** Text-to-speech model and voice. */
  ttsModel?: string;
  ttsVoice?: string;
};

const DEFAULT_BASE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

// Strict structured output wants every object closed with additionalProperties: false.
function toQwenSchema(schema: JsonSchema): object {
  switch (schema.type) {
    case 'string':
      return schema.enum ? { type: 'string', enum: schema.enum } : { type: 'string' };
    case 'boolean':
    case 'integer':
      return { type: schema.type };
    case 'array':
      return { type: 'array', items: toQwenSchema(schema.items) };
    case 'object':
      return {
        type: 'object',
        properties: Object.fromEntries(Object.entries(schema.properties).map(([k, v]) => [k, toQwenSchema(v)])),
        required: schema.required,
        additionalProperties: false,
      };
  }
}

// The omni model takes the container name as the format (wav, mp3, aac, m4a, webm, ogg, amr, 3gp…).
const audioFormat = (mime: string) => {
  const sub = normalizeMime(mime).split('/')[1] ?? 'wav';
  return sub === 'x-wav' || sub === 'wave' ? 'wav' : sub === 'mpeg' ? 'mp3' : sub;
};

const toContent = (part: Part) =>
  'audio' in part
    ? {
        type: 'input_audio',
        input_audio: { data: `data:${normalizeMime(part.audio.mimeType)};base64,${part.audio.data}`, format: audioFormat(part.audio.mimeType) },
      }
    : { type: 'text', text: part.text };

type ChatResponse = { choices?: { message?: { content?: string | null } }[] };
type ChatChunk = { choices?: { delta?: { content?: string | null } }[] };

export function qwenProvider(config: QwenConfig): AgentProvider {
  const baseUrl = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const smart = config.model || 'qwen3.8-flash';
  const models: Record<Tier, string> = {
    smart,
    fast: config.fastModel || 'qwen3.8-flash',
    room: config.roomModel || smart,
  };
  const audioModel = config.audioModel || 'qwen3.8-omni-flash';

  return agentProvider({
    name: `qwen:${smart}+${audioModel}`,

    async call({ system, parts, schema, tier, onText }) {
      const hasAudio = parts.some((p) => 'audio' in p);
      const model = hasAudio ? audioModel : models[tier];
      const thinking = !hasAudio && tier === 'smart' && !!config.thinking;
      // Thinking mode only streams; the reasoning arrives in reasoning_content and is skipped.
      const stream = !!onText || thinking;
      const res = await fetchWithRetry(model, () =>
        fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: 'system',
                content: hasAudio ? `${system}\n\nReply with one JSON object that follows this JSON Schema:\n${JSON.stringify(toQwenSchema(schema))}` : system,
              },
              { role: 'user', content: parts.map(toContent) },
            ],
            response_format: hasAudio
              ? { type: 'json_object' }
              : { type: 'json_schema', json_schema: { name: 'reply', strict: true, schema: toQwenSchema(schema) } },
            enable_thinking: thinking,
            ...(hasAudio ? { modalities: ['text'] } : {}),
            ...(stream ? { stream: true } : {}),
          }),
        })
      );
      if (!res.ok) {
        throw new ProviderError(`Qwen request failed (${res.status}): ${(await res.text()).slice(0, 300)}`, res.status);
      }
      if (stream && res.body) return readSse(res.body, (e) => (e as ChatChunk).choices?.[0]?.delta?.content ?? '', onText ?? (() => {}));
      return ((await res.json()) as ChatResponse).choices?.[0]?.message?.content ?? '';
    },

    async synthesize({ text }) {
      // Text-to-speech is on the native DashScope API next to the compatible one; it returns a link to a WAV file.
      const res = await fetch(`${baseUrl.replace(/\/compatible-mode\/v1$/, '')}/api/v1/services/aigc/multimodal-generation/generation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({ model: config.ttsModel || 'qwen3-tts-flash', input: { text, voice: config.ttsVoice || 'Cherry', language_type: 'Auto' } }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { output?: { audio?: { url?: string; data?: string } } };
      const audio = data.output?.audio;
      if (audio?.data) return { data: audio.data, mimeType: 'audio/wav' };
      if (!audio?.url) return null;
      const file = await fetch(audio.url);
      if (!file.ok) return null;
      return { data: bytesToBase64(new Uint8Array(await file.arrayBuffer())), mimeType: 'audio/wav' };
    },
  });
}
