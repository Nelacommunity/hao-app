import type { AudioInput, CaptionResult, LanguageTarget, RoomAgentTurn, RoomTurnLine, TranslationResult } from '@shared/ai/types';
import type { RoomContext, RoomSummary } from '@shared/rooms/protocol';

import { supabase } from '@/lib/supabase';

export type RoomTurnRequest = {
  speaker: 'USER' | 'LOCAL';
  audio?: AudioInput;
  text?: string;
  userLanguage: LanguageTarget;
  localLanguage: LanguageTarget;
  context: RoomContext | null;
  recent: RoomTurnLine[];
  introduced: boolean;
  summary: RoomSummary | null;
};
export type RoomTurnResponse = { said: string; turn: RoomAgentTurn | null; timing: { stt: number; llm: number } };
/** Early parts of a turn, delivered while the rest is still being generated. */
export type RoomTurnHandlers = { onSaid?: (said: string) => void; onSay?: (text: string) => void };

/** The AI calls a room host makes (injectable so screens can be previewed without a signed-in user). */
export type RoomApi = {
  turn: (req: RoomTurnRequest, handlers?: RoomTurnHandlers) => Promise<RoomTurnResponse>;
  caption: (audio: AudioInput, targets: LanguageTarget[]) => Promise<CaptionResult>;
  translate: (text: string) => Promise<TranslationResult>;
  finish: (summary: RoomSummary | null, context: RoomContext | null) => Promise<void>;
};

async function request(path: string, body: unknown) {
  const { data } = await supabase.auth.getSession();
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
    body: JSON.stringify(body),
  });
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await request(path, body);
  const json = await res.json().catch(() => null);
  if (!res.ok || !json) throw new Error(json?.error ?? `Request failed (${res.status})`);
  return json as T;
}

type TurnEvent =
  | { t: 'said'; said: string }
  | { t: 'say'; text: string }
  | ({ t: 'done' } & RoomTurnResponse)
  | { t: 'error'; error: string };

/** Reads the streamed turn (one JSON event per line), passing early events to `handlers` as they arrive. */
async function streamTurn(req: RoomTurnRequest, handlers: RoomTurnHandlers = {}): Promise<RoomTurnResponse> {
  const res = await request('/api/room/turn', req);
  if (!res.ok || !res.headers.get('content-type')?.includes('ndjson')) {
    const json = await res.json().catch(() => null);
    throw new Error(json?.error ?? `Request failed (${res.status})`);
  }
  let result: RoomTurnResponse | null = null;
  const handle = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as TurnEvent;
    if (event.t === 'said') handlers.onSaid?.(event.said);
    else if (event.t === 'say') handlers.onSay?.(event.text);
    else if (event.t === 'done') result = { said: event.said, turn: event.turn, timing: event.timing };
    else throw new Error(event.error);
  };
  const decoder = new TextDecoder();
  let buffer = '';
  if (res.body) {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      lines.forEach(handle);
    }
  } else {
    buffer = await res.text();
  }
  buffer.split('\n').forEach(handle);
  if (!result) throw new Error('The turn ended early. Please try again.');
  return result;
}

export const roomApi: RoomApi = {
  turn: streamTurn,
  caption: (audio, targets) => post('/api/room/caption', { audio, targets }),
  translate: (text) => post('/api/room/translate', { text }),
  finish: async (summary, context) => {
    await post('/api/room/finish', { summary, context }).catch(() => {});
  },
};
