import {
  captionSchema,
  captionSystemPrompt,
  formatGuideState,
  formatSoloLog,
  knowledgeContext,
  knowledgeWithSources,
  formatMemories,
  roomAgentSchema,
  roomAgentSystemPrompt,
  transcribePrompt,
  transcribeSchema,
  guideSchema,
  guideSystemPrompt,
  MEMORY_KINDS,
  memorySchema,
  memorySystemPrompt,
  languageKey,
  soloSchema,
  soloSystemPrompt,
  translateSchema,
  explainSchema,
  explainSystemPrompt,
  translateSystemPrompt,
  placeTranslateSchema,
  placeTranslateSystemPrompt,
  formatShownPlaces,
  PLACES_CATEGORIES,
  PLACES_FILTERS,
  PLACES_SCOPES,
  PLACES_TOOLS,
  dnaCaptureRules,
  placesPlanSchema,
  placesPlanSystemPrompt,
  placesReplySchema,
  placesReplySystemPrompt,
  uiTranslateSchema,
  uiTranslateSystemPrompt,
  twinSchema,
  twinSystemPrompt,
  conversationSummarySchema,
  conversationSummarySystemPrompt,
  type JsonSchema,
} from './prompts';
import { emptyTwinUpdates, twinDna, twinMissing } from './twin';
import { GuideApps } from './china-guide';
import {
  ProviderError,
  type AgentProvider,
  type AgentTurn,
  type GuideTurn,
  type MemoryTurn,
  type NewMemory,
  type PlacesCategory,
  type PlacesFilter,
  type PlacesPlan,
  type PlacesReply,
  type PlacesTool,
  type PlaceText,
  type RoomAgentTurn,
  type TwinTurn,
  type ConversationSummary,
} from './types';
import { z } from 'zod';

export type ThinkingLevel = 'minimal' | 'low' | 'medium' | 'high' | '';

export type GeminiConfig = {
  apiKey: string;
  /** Used for agent turns, where reasoning quality matters. */
  model?: string;
  thinkingLevel?: ThinkingLevel;
  /** Used for speech-to-text, captions and short translations, where latency matters. */
  fastModel?: string;
  fastThinkingLevel?: ThinkingLevel;
  /** Live room turns (listen + answer in one call), where every second counts. Defaults to `model`. */
  roomModel?: string;
  roomThinkingLevel?: ThinkingLevel;
  /** Text-to-speech model and prebuilt voice. */
  ttsModel?: string;
  ttsVoice?: string;
};

// Room agent replies are validated strictly; anything else triggers one retry.
const roomAgentZod = z.object({
  say_to_other: z.string(),
  say_to_speaker: z.string().default(''),
  whisper_to_user: z.string().default(''),
  alert: z.object({ type: z.enum(['none', 'allergy', 'price', 'scam', 'budget']), message: z.string().default('') }),
  agent_answered_itself: z.boolean().default(false),
  summary_update: z.object({ title: z.string(), items: z.array(z.string()), total: z.string().default('') }),
  memories: z.array(z.object({ kind: z.string(), text: z.string() })).default([]),
});

/** Models sometimes wrap JSON in ```json fences even in JSON mode. */
const stripFences = (text: string) => text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

/** Gemini TTS returns WAV; if raw 16-bit PCM comes back instead, add a WAV header so phones can play it. */
function pcmToWav(base64: string, sampleRate = 24000) {
  const pcm = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const header = new ArrayBuffer(44);
  const v = new DataView(header);
  const writeStr = (o: number, s: string) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  writeStr(0, 'RIFF');
  v.setUint32(4, 36 + pcm.length, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  writeStr(36, 'data');
  v.setUint32(40, pcm.length, true);
  const out = new Uint8Array(44 + pcm.length);
  out.set(new Uint8Array(header), 0);
  out.set(pcm, 44);
  let binary = '';
  for (let i = 0; i < out.length; i += 0x8000) binary += String.fromCharCode(...out.subarray(i, i + 0x8000));
  return btoa(binary);
}

type Tier = 'smart' | 'fast' | 'room';

type GeminiResponse = { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };

const answerText = (data: GeminiResponse) =>
  (data.candidates?.[0]?.content?.parts ?? []).map((p) => (p.thought ? '' : (p.text ?? ''))).join('');

/** Collects a streamed reply, reporting the text so far after every chunk. */
async function readStream(body: ReadableStream<Uint8Array>, onText: (soFar: string) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      try {
        const chunk = answerText(JSON.parse(line.slice(5)) as GeminiResponse);
        if (!chunk) continue;
        text += chunk;
        onText(text);
      } catch {
        // Ignore keep-alives and partial lines.
      }
    }
  }
  return text;
}

/** A string field of a JSON object that is still streaming, once its closing quote has arrived. */
export function completedField(partialJson: string, field: string): string | null {
  const m = new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(partialJson);
  if (!m) return null;
  try {
    return JSON.parse(`"${m[1]}"`) as string;
  } catch {
    return null;
  }
}

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

/** HTTP statuses worth retrying: rate limited, or the model is briefly unavailable. */
const TRANSIENT = new Set([429, 500, 502, 503, 504]);

// Gemini's responseSchema uses upper-case OpenAPI type names.
function toGeminiSchema(schema: JsonSchema): object {
  switch (schema.type) {
    case 'string':
      // Gemini rejects "" as an enum value, and dropping it would force a made-up answer where "" means
      // "not said". Such fields go as plain strings; the prompt lists the values and callers validate them.
      return schema.enum && !schema.enum.includes('') ? { type: 'STRING', enum: schema.enum } : { type: 'STRING' };
    case 'boolean':
      return { type: 'BOOLEAN' };
    case 'integer':
      return { type: 'INTEGER' };
    case 'array':
      return { type: 'ARRAY', items: toGeminiSchema(schema.items) };
    case 'object':
      return {
        type: 'OBJECT',
        properties: Object.fromEntries(Object.entries(schema.properties).map(([k, v]) => [k, toGeminiSchema(v)])),
        required: schema.required,
      };
  }
}

// Browsers record iOS audio as audio/mp4; Gemini lists the same AAC container as audio/m4a.
const normalizeMime = (mime: string) => {
  const base = mime.split(';')[0].trim().toLowerCase();
  return base === 'audio/mp4' || base === 'audio/x-m4a' ? 'audio/m4a' : base;
};

// Model output is untrusted: keep only well-formed, short memories.
const cleanMemories = (list: NewMemory[] | undefined, max = 3) =>
  (list ?? [])
    .filter((m) => m && MEMORY_KINDS.includes(m.kind) && typeof m.text === 'string' && m.text.trim())
    .slice(0, max)
    .map((m) => ({ kind: m.kind, text: m.text.trim().slice(0, 300) }));

export function geminiProvider(config: GeminiConfig): AgentProvider {
  const models: Record<Tier, { name: string; thinking: ThinkingLevel }> = {
    smart: { name: config.model || 'gemini-3.8-flash', thinking: config.thinkingLevel ?? 'low' },
    // Speech-to-text, captions and short translations: a light model is ~2× faster here with the same accuracy.
    fast: { name: config.fastModel || 'gemini-3.5-flash-lite', thinking: config.fastThinkingLevel ?? 'minimal' },
    room: { name: config.roomModel || config.model || 'gemini-3.8-flash', thinking: config.roomThinkingLevel ?? 'low' },
  };

  async function generateJson<T>(
    system: string,
    parts: Part[],
    schema: JsonSchema,
    tier: Tier = 'smart',
    validate?: (raw: unknown) => T | null,
    onText?: (soFar: string) => void
  ): Promise<T> {
    try {
      return await generateOnce<T>(system, parts, schema, tier, validate, onText);
    } catch (e) {
      if (!(e instanceof ProviderError) || e.status !== undefined) throw e;
      // Invalid or off-schema JSON: retry once with a reminder.
      return generateOnce<T>(system, [...parts, { text: 'Your previous reply was not valid JSON for the schema. Reply with the JSON object only.' }], schema, tier, validate);
    }
  }

  async function generateOnce<T>(
    system: string,
    parts: Part[],
    schema: JsonSchema,
    tier: Tier,
    validate?: (raw: unknown) => T | null,
    onText?: (soFar: string) => void
  ): Promise<T> {
    const target = models[tier];
    const model = target.name;
    const thinkingLevel = () => target.thinking;
    const body = () =>
      JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: toGeminiSchema(schema),
          ...(thinkingLevel() ? { thinkingConfig: { thinkingLevel: thinkingLevel() } } : {}),
        },
      });

    // With onText the reply is streamed (server-sent events) so callers can act on the first fields early.
    const method = onText ? 'streamGenerateContent?alt=sse' : 'generateContent';
    const once = () =>
      fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.apiKey },
        body: body(),
      });
    // Rate limits and "model overloaded" are usually gone a moment later: retry twice before giving up.
    const call = async () => {
      let res = await once();
      for (const wait of [700, 1500]) {
        if (!TRANSIENT.has(res.status)) break;
        console.warn(`[ai] ${model} returned ${res.status}; retrying in ${wait}ms`);
        await new Promise((r) => setTimeout(r, wait));
        res = await once();
      }
      return res;
    };

    let res = await call();
    if (res.status === 400 && thinkingLevel()) {
      const detail = await res.text();
      // Older or newer models may not accept the thinking setting; retry once without it.
      if (/thinking/i.test(detail)) {
        // 'minimal' is only on some models: step up to 'low' (leaving it out would mean slower dynamic thinking).
        const next = target.thinking === 'minimal' ? 'low' : '';
        console.warn(`[ai] ${model} rejected thinkingLevel=${thinkingLevel()}; using ${next || 'the model default'}`);
        target.thinking = next;
        res = await call();
      } else {
        throw new ProviderError(`Gemini request failed (400): ${detail.slice(0, 300)}`, 400);
      }
    }
    if (!res.ok) {
      throw new ProviderError(`Gemini request failed (${res.status}): ${(await res.text()).slice(0, 300)}`, res.status);
    }

    const text = onText && res.body ? await readStream(res.body, onText) : answerText(await res.json());
    let raw: unknown;
    try {
      raw = JSON.parse(stripFences(text));
    } catch {
      throw new ProviderError('Gemini returned a response that is not valid JSON');
    }
    if (!validate) return raw as T;
    const valid = validate(raw);
    if (valid === null) throw new ProviderError('Gemini returned JSON that does not match the schema');
    return valid;
  }

  const audioPart = (audio: { data: string; mimeType: string }): Part => ({
    inlineData: { mimeType: normalizeMime(audio.mimeType), data: audio.data },
  });

  return {
    name: models.fast.name === models.smart.name ? `gemini:${models.smart.name}` : `gemini:${models.smart.name}+${models.fast.name}`,

    async soloTurn(input) {
      const who = input.speaker === 'local' ? 'LOCAL person' : 'TRAVELLER';
      const recentText = input.log.slice(-3).map((e) => ('text' in e ? e.text : e.gloss)).join(' ');
      const { context: knowledge, sources } = knowledgeWithSources(`${input.text ?? ''} ${recentText}`, input.memories, { limit: 2, maxChars: 7000 });
      const turn = await generateJson<AgentTurn>(
        soloSystemPrompt(input.travellerLanguage || 'English'),
        [
          {
            text: `What you remember about the traveller:\n${input.memories || '(nothing yet)'}${knowledge}\n\nConversation so far:\n${formatSoloLog(input.log)}\n\nNew input from the ${who}:`,
          },
          input.audio ? audioPart(input.audio) : { text: input.text ?? '' },
        ],
        soloSchema
      );
      return { ...turn, memories: cleanMemories(turn.memories), sources };
    },

    async transcribeAndTranslate({ audio, sourceLanguage, targets }) {
      const raw = await generateJson<{ transcript: string; translations: Record<string, string> }>(
        captionSystemPrompt(sourceLanguage, targets),
        [audioPart(audio)],
        captionSchema(targets),
        'fast'
      );
      const translations: Record<string, string> = {};
      for (const t of targets) translations[t.code] = raw.translations?.[languageKey(t.code)] ?? '';
      return { transcript: raw.transcript ?? '', translations };
    },

    async guideTurn(input) {
      const lastAsked = input.history.filter((m) => m.role === 'user').slice(-2).map((m) => m.text);
      const active = input.tasks.find((t) => t.id === input.activeTaskId)?.title ?? '';
      const { context: knowledge, sources } = knowledgeWithSources([input.text, input.text, ...lastAsked, active].join(' '), input.memories);
      const turn = await generateJson<GuideTurn>(
        `${guideSystemPrompt(input.language, input.preferences, input.city)}\n\n${dnaCaptureRules}`,
        [
          {
            text: `What you remember about the traveller:\n${input.memories || '(nothing yet)'}${knowledge}${input.story ? `\n\n${input.story}` : ''}\n\n${formatGuideState(input.history, input.tasks, input.activeTaskId)}\n\nUser now says:\n${input.text}`,
          },
        ],
        guideSchema
      );
      // Defensive clean-up: the model output is untrusted input to the UI.
      return {
        ...turn,
        task_steps: (turn.task_steps ?? []).slice(0, 8),
        step_updates: (turn.step_updates ?? []).filter((u) => Number.isInteger(u.step_index) && u.step_index >= 0),
        quick_replies: (turn.quick_replies ?? []).slice(0, 4),
        apps: (turn.apps ?? []).filter((a) => a in GuideApps).slice(0, 3),
        memories: cleanMemories(turn.memories),
        sources,
        dna: { ...emptyTwinUpdates(), ...(turn.dna ?? {}) },
      };
    },

    async memoryTurn(input) {
      const chat = input.history.slice(-8).map((m) => `${m.role === 'user' ? 'Traveller' : 'Hao'}: ${m.text}`).join('\n');
      const turn = await generateJson<MemoryTurn>(
        memorySystemPrompt(input.language, input.now),
        [{ text: `Memories:\n${formatMemories(input.memories)}\n\nRecent chat:\n${chat || '(none)'}\n\nTraveller asks:\n${input.question}` }],
        memorySchema
      );
      const known = new Set(input.memories.map((m) => m.id));
      return {
        answer: turn.answer ?? '',
        cited_ids: (turn.cited_ids ?? []).filter((id) => known.has(id)).slice(0, 8),
        new_memories: cleanMemories(turn.new_memories),
      };
    },

    async placesPlan(input) {
      const chat = input.history.slice(-10).map((m) => `${m.role === 'user' ? 'Traveller' : 'Hao'}: ${m.text}`).join('\n');
      const plan = await generateJson<PlacesPlan>(
        placesPlanSystemPrompt(input.language, input.preferences, input.about, input.where),
        [
          {
            text: `What you remember about the traveller:\n${input.memories || '(nothing yet)'}\n\nPlaces shown in this chat (ref. name [category]):\n${formatShownPlaces(input.shown)}\n\nRecent chat:\n${chat || '(new chat)'}\n\nTraveller says:\n${input.text}`,
          },
        ],
        placesPlanSchema
      );
      // Model output is untrusted: keep only valid tools, categories and filters.
      const refs = new Set(input.shown.map((p) => p.ref));
      return {
        tool: PLACES_TOOLS.includes(plan.tool) ? (plan.tool as PlacesTool) : 'none',
        query: String(plan.query ?? '').trim().slice(0, 60),
        category: PLACES_CATEGORIES.includes(plan.category) ? (plan.category as PlacesCategory) : '',
        near: String(plan.near ?? '').trim().slice(0, 40),
        filters: (plan.filters ?? []).filter((f): f is PlacesFilter => PLACES_FILTERS.includes(f)).slice(0, 4),
        place_ref: refs.has(plan.place_ref) ? plan.place_ref : 0,
        place_name: String(plan.place_name ?? '').trim().slice(0, 80),
        rating: plan.rating === 1 || plan.rating === -1 ? plan.rating : 0,
        tags: (plan.tags ?? []).filter((t) => typeof t === 'string').slice(0, 5),
        scope: PLACES_SCOPES.includes(plan.scope) ? plan.scope : '',
        // Validated against the profile by the route (applyTwinUpdates).
        dna: { ...emptyTwinUpdates(), ...(plan.dna ?? {}) },
        reply: String(plan.reply ?? '').slice(0, 600),
        quick_replies: (plan.quick_replies ?? []).filter((q) => typeof q === 'string' && q.trim()).slice(0, 4),
      };
    },

    async twinTurn(input) {
      const chat = input.history.slice(-14).map((m) => `${m.role === 'user' ? 'User' : 'Hao'}: ${m.text}`).join('\n');
      const detected = [
        input.detected.nationality && input.detected.nationality !== input.profile.nationality ? `Country (phone region): ${input.detected.nationality}` : '',
        input.detected.city && input.detected.city !== input.profile.city ? `City in China (GPS): ${input.detected.city}` : '',
      ].filter(Boolean);
      const turn = await generateJson<TwinTurn>(
        twinSystemPrompt(input.language),
        [
          {
            text: `Hao DNA so far:\n${twinDna(input.profile)}\n\nProbably still unknown: ${twinMissing(input.profile).join(', ') || 'nothing'}\n\nDETECTED:\n${detected.join('\n') || '(nothing new)'}\n\nChat so far:\n${chat || '(new conversation: greet the user and ask the first question)'}\n\n${input.text ? `User says:\n${input.text}` : 'Start the conversation.'}`,
          },
        ],
        twinSchema
      );
      // The route validates updates (applyTwinUpdates); here only shape and size.
      return {
        reply: String(turn.reply ?? '').trim().slice(0, 600),
        quick_replies: (turn.quick_replies ?? []).filter((q) => typeof q === 'string' && q.trim()).slice(0, 5),
        updates: { ...emptyTwinUpdates(), ...(turn.updates ?? {}) },
        done: turn.done === true,
      };
    },

    async summarizeConversation(input) {
      const transcript = input.lines
        .slice(-80)
        .map((l) => `${l.speaker === 'USER' ? `Traveller${input.names?.user ? ` (${input.names.user})` : ''}` : l.speaker === 'LOCAL' ? `Local${input.names?.local ? ` (${input.names.local})` : ''}` : 'Hao'}: ${l.text}`)
        .join('\n');
      const out = await generateJson<ConversationSummary>(
        conversationSummarySystemPrompt(input.language),
        [{ text: `Where: ${input.context || 'a casual conversation'}\n\nConversation:\n${transcript}` }],
        conversationSummarySchema
      );
      return {
        title: String(out.title ?? '').trim().slice(0, 60) || 'Conversation',
        summary: String(out.summary ?? '').trim().slice(0, 600),
        learned: (out.learned ?? []).filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim().slice(0, 200)).slice(0, 5),
        memories: cleanMemories(out.memories),
        dna: { ...emptyTwinUpdates(), ...(out.dna ?? {}) },
      };
    },

    async placesReply(input) {
      const chat = input.history.slice(-6).map((m) => `${m.role === 'user' ? 'Traveller' : 'Hao'}: ${m.text}`).join('\n');
      const out = await generateJson<PlacesReply>(
        placesReplySystemPrompt(input.language),
        [
          {
            text: `Recent chat:\n${chat || '(new chat)'}\n\nTraveller says:\n${input.text}\n\nTool ${input.tool} returned:\n${input.results}${input.dna ? `\n\nTraveller's Hao DNA:\n${input.dna}` : ''}`,
          },
        ],
        placesReplySchema
      );
      return {
        reply: String(out.reply ?? '').slice(0, 800),
        quick_replies: (out.quick_replies ?? []).filter((q) => typeof q === 'string' && q.trim()).slice(0, 4),
      };
    },

    async explain({ title, facts, language }) {
      const raw = await generateJson<{ text: string }>(explainSystemPrompt(language), [{ text: `${title}\n\n${facts}` }], explainSchema);
      return { text: String(raw.text ?? '').trim().slice(0, 1500) };
    },

    async transcribe({ audio, expected }) {
      const raw = await generateJson<{ text: string; language: string }>(transcribePrompt(expected), [audioPart(audio)], transcribeSchema, 'fast');
      return { text: (raw.text ?? '').trim(), language: raw.language ?? '' };
    },

    async roomAgentTurn(input, onSay) {
      const lines = input.recent.map((l) => `[${l.speaker}${l.to ? ` → ${l.to}` : ''}]: ${l.text}`).join('\n');
      // One small section only: room turns are latency-sensitive.
      const knowledge = knowledgeContext(`${input.said || input.recent.slice(-2).map((l) => l.text).join(' ')} ${input.context ?? ''}`, input.memories, { limit: 1, maxChars: 3500 });
      let spoken = false;
      const summary = input.summary ? `${input.summary.title}: ${input.summary.items.join('; ')}${input.summary.total ? ` (total ${input.summary.total})` : ''}` : '(none)';
      const turn = await generateJson<RoomAgentTurn>(
        roomAgentSystemPrompt(input),
        [
          {
            text: `What you remember about the traveller:\n${input.memories || '(nothing yet)'}${knowledge}\n\nintroduced: ${input.introduced}\nCurrent summary: ${summary}\n\nLast turns:\n${lines || '(none yet)'}\n\nThe ${input.speaker === 'USER' ? 'TRAVELLER' : 'LOCAL'} just said${input.said ? `:\n${input.said}` : ' (audio):'}`,
          },
          ...(input.audio && !input.said ? [audioPart(input.audio)] : []),
        ],
        roomAgentSchema,
        'room',
        (raw) => {
          const parsed = roomAgentZod.safeParse(raw);
          if (!parsed.success) return null;
          const d = parsed.data;
          return {
            say_to_other: d.say_to_other.trim(),
            say_to_speaker: d.say_to_speaker.trim(),
            whisper_to_user: d.whisper_to_user.trim(),
            alert: d.alert.type === 'none' || !d.alert.message.trim() ? { type: null, message: '' } : { type: d.alert.type, message: d.alert.message.trim() },
            agent_answered_itself: d.agent_answered_itself,
            summary_update: d.summary_update.title.trim()
              ? {
                  ...d.summary_update,
                  items: d.summary_update.items.slice(0, 20),
                  // Placeholders like "unknown" or "TBD" mean no total yet.
                  total: /^(unknown|n\/?a|tbd|none|-|未知|待定)?$/i.test(d.summary_update.total.trim()) ? '' : d.summary_update.total.trim(),
                }
              : null,
            memories: cleanMemories(d.memories as NewMemory[], 2),
          };
        },
        onSay &&
          ((soFar) => {
            if (spoken) return;
            const say = completedField(soFar, 'say_to_other')?.trim();
            if (say) {
              spoken = true;
              onSay(say);
            }
          })
      );
      return turn;
    },

    async synthesize({ text }) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${config.ttsModel || 'gemini-3.8-flash-lite-tts'}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: config.ttsVoice || 'Kore' } } },
          },
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { candidates?: { content?: { parts?: { inlineData?: { mimeType: string; data: string } }[] } }[] };
      const audio = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
      if (!audio?.data) return null;
      const mime = audio.mimeType.toLowerCase();
      if (mime.startsWith('audio/wav') || mime.startsWith('audio/x-wav')) return { data: audio.data, mimeType: 'audio/wav' };
      const rate = Number(/rate=(\d+)/.exec(mime)?.[1] ?? 24000);
      return { data: pcmToWav(audio.data, rate), mimeType: 'audio/wav' };
    },

    async translate({ text, target }) {
      const raw = await generateJson<{ translation: string; detected_language: string }>(
        translateSystemPrompt(target),
        [{ text }],
        translateSchema,
        'fast'
      );
      return { text: raw.translation ?? '', detectedLanguage: raw.detected_language ?? '' };
    },

    async translateUi({ strings, target }) {
      const raw = await generateJson<{ translations: string[] }>(
        uiTranslateSystemPrompt(target),
        [{ text: JSON.stringify({ strings }) }],
        uiTranslateSchema,
        'smart'
      );
      const out = Array.isArray(raw.translations) ? raw.translations : [];
      // Untrusted model output: keep a translation only if it is a short string with the same placeholders.
      const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
      return strings.map((source, i) => {
        const text = typeof out[i] === 'string' ? out[i].trim() : '';
        const ok = out.length === strings.length && text && text.length <= source.length * 4 + 40 && placeholders(text) === placeholders(source);
        return ok ? text : source;
      });
    },

    async translatePlaces({ places, target }) {
      const raw = await generateJson<{ places: PlaceText[] }>(
        placeTranslateSystemPrompt(target),
        [{ text: JSON.stringify({ places }) }],
        placeTranslateSchema,
        'fast'
      );
      const out = Array.isArray(raw.places) ? raw.places : [];
      if (out.length !== places.length) return places.map(() => null);
      // Untrusted model output: keep only well-formed, reasonably sized text.
      const fits = (text: unknown, source: string): text is string =>
        typeof text === 'string' && !!text.trim() && text.length <= source.length * 4 + 60;
      return places.map((source, i) => {
        const p = out[i];
        if (!p || !fits(p.name, source.name)) return null;
        return {
          name: p.name.trim(),
          address: fits(p.address, source.address) ? p.address.trim() : source.address,
          type: fits(p.type, source.type) ? p.type.trim() : source.type,
          tags: Array.isArray(p.tags) && p.tags.length === source.tags.length ? p.tags.map((t, j) => (fits(t, source.tags[j]) ? t.trim() : source.tags[j])) : source.tags,
        };
      });
    },
  };
}
