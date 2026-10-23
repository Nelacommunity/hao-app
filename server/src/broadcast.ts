import { randomUUID } from 'node:crypto';

import type { AgentProvider, AudioInput, LanguageTarget } from '../../shared/ai/types';
import { connectedListeners, send, sendToRole, takeAiCall, type CaptionRecord, type Participant, type Room } from './rooms';

const MANDARIN: LanguageTarget = { code: 'zh', name: 'Mandarin Chinese' };
const MAX_CONCURRENT = 3;
const GAP_TIMEOUT_MS = 8000;
const MAX_CAPTIONS = 200;
const MAX_QUESTIONS = 50;

/** Languages currently present in the room: translate once per language, not per listener. */
function presentLanguages(room: Room): LanguageTarget[] {
  const byCode = new Map<string, LanguageTarget>();
  for (const p of connectedListeners(room)) byCode.set(p.language!.code, p.language!);
  return [...byCode.values()];
}

async function acquire(room: Room) {
  const b = room.broadcast;
  while (b.inFlight >= MAX_CONCURRENT) await new Promise<void>((resolve) => b.waiting.push(resolve));
  b.inFlight += 1;
}

function release(room: Room) {
  const b = room.broadcast;
  b.inFlight -= 1;
  b.waiting.shift()?.();
}

/**
 * Chunks may finish out of order (a long chunk can be slower than the next one), so results are held
 * until every earlier sequence number has been emitted. Captions therefore always appear in spoken order.
 */
function flush(room: Room) {
  const b = room.broadcast;
  while (b.ready.has(b.nextEmitSeq)) {
    const record = b.ready.get(b.nextEmitSeq)!;
    b.ready.delete(b.nextEmitSeq);
    b.nextEmitSeq += 1;
    if (!record || !record.zh.trim()) continue;

    b.captions = [...b.captions, record].slice(-MAX_CAPTIONS);
    sendToRole(room, 'host', { t: 'transcript', line: { seq: record.seq, zh: record.zh } });
    for (const p of connectedListeners(room)) {
      const text = record.translations[p.language!.code];
      if (text) send(p.socket, { t: 'caption', caption: { seq: record.seq, text } });
    }
  }

  // A chunk lost to a dropped connection must not block later captions forever.
  if (b.gapTimer) clearTimeout(b.gapTimer);
  b.gapTimer = null;
  if (b.ready.size > 0) {
    b.gapTimer = setTimeout(() => {
      // Still transcribing means slow, not lost: keep waiting so order is preserved.
      if (b.processing.has(b.nextEmitSeq)) return flush(room);
      console.warn(`[broadcast] room=${room.id} skipping missing chunk seq=${b.nextEmitSeq}`);
      b.ready.set(b.nextEmitSeq, null);
      flush(room);
    }, GAP_TIMEOUT_MS);
  }
}

export async function handleChunk(provider: AgentProvider, room: Room, host: Participant, seq: number, audio: AudioInput) {
  const b = room.broadcast;
  if (!Number.isInteger(seq) || seq < b.nextEmitSeq || b.ready.has(seq) || b.processing.has(seq)) return; // duplicate or stale
  b.highestSeq = Math.max(b.highestSeq, seq);
  b.processing.add(seq);

  if (!takeAiCall(room)) {
    send(host.socket, { t: 'error', code: 'rate_limited', message: 'Caption limit reached for this minute; skipping a chunk.' });
    b.processing.delete(seq);
    b.ready.set(seq, null);
    flush(room);
    return;
  }

  await acquire(room);
  const targets = presentLanguages(room);
  const started = Date.now();
  let record: CaptionRecord | null = null;
  try {
    const result = await provider.transcribeAndTranslate({ audio, sourceLanguage: MANDARIN, targets });
    record = { seq, zh: result.transcript, translations: result.translations };
    console.log(
      `[ai] room=${room.id} kind=caption seq=${seq} langs=${targets.map((t) => t.code).join(',') || '-'} audio=${Math.round(audio.data.length * 0.75 / 1024)}KB ms=${Date.now() - started}`
    );
  } catch (e) {
    console.error(`[ai] room=${room.id} kind=caption seq=${seq} failed after ${Date.now() - started}ms:`, (e as Error).message);
    send(host.socket, { t: 'error', code: 'ai_failed', message: 'A caption chunk failed and was skipped.' });
  } finally {
    release(room);
    b.processing.delete(seq);
  }
  if (seq >= b.nextEmitSeq) b.ready.set(seq, record);
  flush(room);
}

export async function handleQuestion(provider: AgentProvider, room: Room, listener: Participant, text: string) {
  const clean = text.trim().slice(0, 300);
  if (!clean) return;
  if (!takeAiCall(room)) {
    send(listener.socket, { t: 'error', code: 'rate_limited', message: 'Too many questions right now. Try again shortly.' });
    return;
  }
  const started = Date.now();
  try {
    const result = await provider.translate({ text: clean, target: MANDARIN });
    console.log(`[ai] room=${room.id} kind=question ms=${Date.now() - started}`);
    const question = {
      id: randomUUID(),
      original: clean,
      zh: result.text,
      language: listener.language?.name ?? result.detectedLanguage,
      at: Date.now(),
    };
    room.broadcast.questions = [...room.broadcast.questions, question].slice(-MAX_QUESTIONS);
    sendToRole(room, 'host', { t: 'question', question });
    send(listener.socket, { t: 'question_sent', ok: true });
  } catch (e) {
    console.error(`[ai] room=${room.id} kind=question failed:`, (e as Error).message);
    send(listener.socket, { t: 'question_sent', ok: false });
  }
}

/** Captions a (re)joining listener can catch up on, in their language. */
export function captionsFor(room: Room, language: LanguageTarget | null) {
  if (!language) return [];
  return room.broadcast.captions
    .filter((c) => c.translations[language.code])
    .slice(-50)
    .map((c) => ({ seq: c.seq, text: c.translations[language.code] }));
}
