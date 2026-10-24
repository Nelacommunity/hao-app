// Gemini calls for the story generator: structured JSON text, and (optional) illustrations.
// Same REST API as shared/ai/gemini.ts, reduced to what generation needs.
import { generatedStoryJsonSchema } from '../../../shared/stories/schema.ts';
import type { StoryModel } from '../../../shared/stories/generate.ts';

const API = 'https://generativelanguage.googleapis.com/v1beta/models';

// Gemini's responseSchema uses upper-case OpenAPI type names.
function toGeminiSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const type = String(schema.type).toUpperCase();
  if (type === 'OBJECT') {
    const props = schema.properties as Record<string, Record<string, unknown>>;
    return { type, properties: Object.fromEntries(Object.entries(props).map(([k, v]) => [k, toGeminiSchema(v)])), required: schema.required };
  }
  if (type === 'ARRAY') {
    return { type, items: toGeminiSchema(schema.items as Record<string, unknown>), minItems: schema.minItems, maxItems: schema.maxItems };
  }
  return { type, ...(schema.description ? { description: schema.description } : {}) };
}

export function geminiStoryModel(apiKey: string, model: string): StoryModel {
  return {
    name: model,
    async generate({ system, prompt }) {
      const res = await fetch(`${API}/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', responseSchema: toGeminiSchema(generatedStoryJsonSchema), temperature: 0.7 },
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      return (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
    },
  };
}

/** Generates one image with a Gemini image model; returns PNG/JPEG bytes and their type, or null. */
export async function geminiImage(apiKey: string, model: string, prompt: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
  const res = await fetch(`${API}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['IMAGE'] } }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`Gemini image ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[] };
  const image = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
  if (!image?.data) return null;
  return { bytes: Uint8Array.from(atob(image.data), (c) => c.charCodeAt(0)), mime: image.mimeType ?? 'image/png' };
}

/** Placeholder model for local runs without a key (STORIES_MOCK=true): valid [PLACEHOLDER] stories. */
export function mockStoryModel(): StoryModel {
  return {
    name: 'mock',
    async generate({ prompt }) {
      const slides = Number(/SLIDES: exactly (\d)/.exec(prompt)?.[1] ?? 3);
      const type = /STORY TYPE: (\w+)/.exec(prompt)?.[1] ?? 'story';
      return JSON.stringify({
        title: `[PLACEHOLDER] ${type.replace(/_/g, ' ')}`,
        slides: Array.from({ length: slides }, (_, i) => ({ heading: `[PLACEHOLDER] slide ${i + 1}`, body: '[PLACEHOLDER] Generated from the facts given.' })),
        action_label: /BUTTON on the last slide: "([^"]+)"/.exec(prompt)?.[1] ?? 'Ask Hao more',
      });
    },
  };
}
