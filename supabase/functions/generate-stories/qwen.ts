// Qwen calls for the story generator (Alibaba Model Studio): structured JSON text, and (optional) illustrations.
// Same API as shared/ai/qwen.ts, reduced to what generation needs.
import { generatedQuizStoryJsonSchema, generatedStoryJsonSchema } from '../../../shared/stories/schema.ts';
import type { StoryModel } from '../../../shared/stories/generate.ts';

export const DEFAULT_BASE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

// Strict structured output wants every object closed with additionalProperties: false.
function toQwenSchema(schema: Record<string, unknown>): Record<string, unknown> {
  if (schema.type === 'object') {
    const props = schema.properties as Record<string, Record<string, unknown>>;
    return { ...schema, properties: Object.fromEntries(Object.entries(props).map(([k, v]) => [k, toQwenSchema(v)])), additionalProperties: false };
  }
  if (schema.type === 'array') return { ...schema, items: toQwenSchema(schema.items as Record<string, unknown>) };
  return schema;
}

export function qwenStoryModel(apiKey: string, model: string, baseUrl = DEFAULT_BASE_URL): StoryModel {
  return {
    name: model,
    async generate({ system, prompt, quiz }) {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: prompt },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'story', strict: true, schema: toQwenSchema(quiz ? generatedQuizStoryJsonSchema : generatedStoryJsonSchema) },
          },
          enable_thinking: false,
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`Qwen ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const json = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
      return json.choices?.[0]?.message?.content ?? '';
    },
  };
}

/** Generates one image with a Qwen image model; returns PNG/JPEG bytes and their type, or null. */
export async function qwenImage(apiKey: string, model: string, prompt: string, baseUrl = DEFAULT_BASE_URL): Promise<{ bytes: Uint8Array; mime: string } | null> {
  // Images are on the native DashScope API next to the compatible one; the reply links to the file.
  const res = await fetch(`${baseUrl.replace(/\/compatible-mode\/v1\/?$/, '')}/api/v1/services/aigc/multimodal-generation/generation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, input: { messages: [{ role: 'user', content: [{ text: prompt }] }] }, parameters: { watermark: false } }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`Qwen image ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { output?: { choices?: { message?: { content?: { image?: string }[] } }[] } };
  const url = json.output?.choices?.[0]?.message?.content?.find((c) => c.image)?.image;
  if (!url) return null;
  const file = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!file.ok) return null;
  return { bytes: new Uint8Array(await file.arrayBuffer()), mime: file.headers.get('content-type')?.split(';')[0] || 'image/png' };
}

/** Placeholder model for local runs without a key (STORIES_MOCK=true): valid [PLACEHOLDER] stories. */
export function mockStoryModel(): StoryModel {
  return {
    name: 'mock',
    async generate({ prompt, quiz }) {
      const slides = Number(/SLIDES: exactly (\d)/.exec(prompt)?.[1] ?? 3);
      const type = /STORY TYPE: (\w+)/.exec(prompt)?.[1] ?? 'story';
      return JSON.stringify({
        title: `[PLACEHOLDER] ${type.replace(/_/g, ' ')}`,
        slides: Array.from({ length: slides }, (_, i) => ({ heading: `[PLACEHOLDER] slide ${i + 1}`, body: '[PLACEHOLDER] Generated from the facts given.' })),
        action_label: /BUTTON on the last slide: "([^"]+)"/.exec(prompt)?.[1] ?? 'Ask Hao more',
        ...(quiz ? { quiz: { question: '[PLACEHOLDER] question?', choices: ['[PLACEHOLDER] right', '[PLACEHOLDER] wrong'], answer: 0, why: '[PLACEHOLDER] why' } } : {}),
      });
    },
  };
}
