import { randomUUID } from 'node:crypto';

import type { AgentProvider, AudioInput, LanguageTarget, NewMemory, RoomSpeaker } from '../../shared/ai/types';
import { RoomContexts, type ConvCaption, type Phase, type RoomContext } from '../../shared/rooms/protocol';
import { config } from './config';
import { recallText, saveMemories } from './memory';
import { send, sendToRole, takeAiCall, type Participant, type Room } from './rooms';

const MAX_CAPTIONS = 60;
const RECENT_LINES = 12; // ≈ the last 6 turns (each turn is a spoken line plus Hao's reply)
const LISTEN_TIMEOUT_MS = 30_000;
const MANDARIN: LanguageTarget = { code: 'zh', name: 'Mandarin Chinese' };

// BCP 47 tags for the phones' built-in voices.
const SPEECH_TAGS: Record<string, string> = {
  zh: 'zh-CN', 'zh-TW': 'zh-TW', yue: 'zh-HK', en: 'en-US', fr: 'fr-FR', es: 'es-ES', de: 'de-DE', ja: 'ja-JP',
  ko: 'ko-KR', ru: 'ru-RU', ar: 'ar-SA', pt: 'pt-PT', 'pt-BR': 'pt-BR', it: 'it-IT', sw: 'sw-KE', hi: 'hi-IN',
  vi: 'vi-VN', th: 'th-TH', id: 'id-ID', tr: 'tr-TR',
};
export const speechTag = (code: string) => SPEECH_TAGS[code] ?? (code.includes('-') ? code : `${code}`);

export const localOf = (room: Room) => [...room.participants.values()].find((p) => p.role === 'local') ?? null;
const hostOf = (room: Room) => [...room.participants.values()].find((p) => p.role === 'host') ?? null;
const localLanguage = (room: Room) => localOf(room)?.language ?? MANDARIN;

function caption(room: Room, view: 'host' | 'local', line: Omit<ConvCaption, 'id' | 'at'>) {
  const c: ConvCaption = { ...line, id: randomUUID(), at: Date.now() };
  const list = view === 'host' ? room.conversation.hostCaptions : room.conversation.localCaptions;
  list.push(c);
  if (list.length > MAX_CAPTIONS) list.splice(0, list.length - MAX_CAPTIONS);
  sendToRole(room, view === 'host' ? 'host' : 'local', { t: 'conv_caption', caption: c });
}

export function setPhase(room: Room, phase: Phase, by: RoomSpeaker | null = null, timeoutMs = 0) {
  const c = room.conversation;
  if (c.phaseTimer) clearTimeout(c.phaseTimer);
  c.phaseTimer = timeoutMs ? setTimeout(() => setPhase(room, 'idle'), timeoutMs) : null;
  if (phase === 'idle') c.awaitingPlayback.clear();
  c.phase = { phase, by };
  for (const p of room.participants.values()) send(p.socket, { t: 'phase', state: c.phase });
}

const speakerOf = (p: Participant): RoomSpeaker | null => (p.role === 'host' ? 'USER' : p.role === 'local' ? 'LOCAL' : null);

/** A phone started (or cancelled) recording. Only one person can hold the turn. */
export function handleMic(room: Room, from: Participant, active: boolean) {
  const speaker = speakerOf(from);
  if (!speaker) return;
  const c = room.conversation;
  if (active) {
    if (c.phase.phase !== 'idle' && !(c.phase.phase === 'listening' && c.phase.by === speaker)) {
      return send(from.socket, { t: 'error', code: 'busy', message: from.role === 'local' ? '请稍等，Hao 正在说话…' : 'Hao is speaking… please wait.' });
    }
    setPhase(room, 'listening', speaker, LISTEN_TIMEOUT_MS);
  } else if (c.phase.phase === 'listening' && c.phase.by === speaker) {
    setPhase(room, 'idle');
  }
}

/** A phone finished playing Hao's voice; when everyone has, the floor is open again. */
export function handlePlayed(room: Room, from: Participant) {
  const c = room.conversation;
  c.awaitingPlayback.delete(from.id);
  if (c.phase.phase === 'speaking' && c.awaitingPlayback.size === 0) setPhase(room, 'idle');
}

export function setContext(room: Room, context: RoomContext | null) {
  room.conversation.context = context && context in RoomContexts ? context : null;
  sendToRole(room, 'host', { t: 'context', context: room.conversation.context });
}

type TurnInput = { audio?: AudioInput; text?: string };

export async function handleTurn(provider: AgentProvider, room: Room, from: Participant, input: TurnInput) {
  const speaker = speakerOf(from);
  if (!speaker) return;
  const c = room.conversation;
  const busy = c.phase.phase === 'thinking' || c.phase.phase === 'speaking' || (c.phase.phase === 'listening' && c.phase.by !== speaker);
  if (busy) {
    return send(from.socket, { t: 'error', code: 'busy', message: from.role === 'local' ? '请稍等，Hao 正在说话…' : 'Hao is speaking… please wait.' });
  }
  if (!takeAiCall(room)) {
    setPhase(room, 'idle');
    return send(from.socket, { t: 'error', code: 'rate_limited', message: 'Too many turns in a short time. Wait a moment.' });
  }

  setPhase(room, 'thinking', speaker, 45_000);
  c.lastTurnAt = Date.now();
  const timing = { stt: 0, llm: 0, tts: 0 };
  const started = Date.now();
  const userLanguage = room.userLanguage;
  const localLang = localLanguage(room);

  try {
    // 1. Speech to text.
    let said = input.text?.trim() ?? '';
    if (input.audio) {
      const t = Date.now();
      const transcript = await provider.transcribe({ audio: input.audio, expected: [userLanguage, localLang] });
      timing.stt = Date.now() - t;
      said = transcript.text;
    }
    if (!said) {
      send(from.socket, { t: 'not_heard' });
      setPhase(room, 'idle');
      console.log(`[turn] room=${room.id} speaker=${speaker} empty stt=${timing.stt}ms`);
      return;
    }

    // Show what was said straight away, before the agent replies.
    caption(room, 'host', { speaker, text: said });
    if (speaker === 'LOCAL') caption(room, 'local', { speaker, text: said });

    // 2. The agent.
    const memories = c.memoryEnabled && c.memoryToken ? await recallText(c.memoryToken, said) : undefined;
    const t = Date.now();
    const turn = await provider.roomAgentTurn({
      userName: c.userName,
      userLanguage,
      localLanguage: localLang,
      preferences: room.preferences,
      context: c.context ? RoomContexts[c.context].label : null,
      recent: c.recent.slice(-RECENT_LINES),
      introduced: c.introduced,
      summary: c.summary,
      memories,
      speaker,
      said,
    });
    timing.llm = Date.now() - t;

    c.recent.push({ speaker, text: said });

    // 3. Private updates for the user only.
    if (turn.whisper_to_user) {
      c.whispers = [...c.whispers, turn.whisper_to_user].slice(-20);
      sendToRole(room, 'host', { t: 'whisper', text: turn.whisper_to_user });
    }
    if (turn.alert.type) {
      const alert = { type: turn.alert.type, message: turn.alert.message, at: Date.now() };
      c.alerts = [...c.alerts, alert].slice(-20);
      sendToRole(room, 'host', { t: 'alert', alert });
    }
    if (turn.summary_update) {
      c.summary = turn.summary_update;
      sendToRole(room, 'host', { t: 'summary', summary: c.summary });
    }

    // 4. What Hao says aloud, and to whom.
    const other: RoomSpeaker = speaker === 'USER' ? 'LOCAL' : 'USER';
    const lines = [
      { to: other, text: turn.say_to_other },
      { to: speaker, text: turn.say_to_speaker },
    ].filter((l) => l.text);

    for (const line of lines) {
      if (line.to === 'LOCAL') c.introduced = true;
      c.recent.push({ speaker: 'AGENT', to: line.to, text: line.text });
      caption(room, 'host', { speaker: 'AGENT', to: line.to, text: line.text });
      if (line.to === 'LOCAL') caption(room, 'local', { speaker: 'AGENT', to: 'LOCAL', text: line.text });
    }
    if (c.recent.length > RECENT_LINES * 2) c.recent.splice(0, c.recent.length - RECENT_LINES * 2);

    // 5. Voice: server TTS when enabled, otherwise each phone speaks with its own voice.
    const tts = Date.now();
    const voiced = await Promise.all(
      lines.map(async (line) => {
        const language = line.to === 'LOCAL' ? localLang : userLanguage;
        const audio = config.roomTts === 'gemini' ? await provider.synthesize({ text: line.text, language }).catch(() => null) : null;
        return { ...line, language, audio };
      })
    );
    timing.tts = config.roomTts === 'gemini' ? Date.now() - tts : 0;

    const host = hostOf(room);
    const local = localOf(room);
    c.awaitingPlayback.clear();
    for (const v of voiced) {
      const target = v.to === 'LOCAL' ? local : host;
      if (!target?.socket) continue;
      c.awaitingPlayback.add(target.id);
      send(target.socket, { t: 'voice', id: randomUUID(), text: v.text, lang: speechTag(v.language.code), audio: v.audio });
    }
    if (c.awaitingPlayback.size) {
      // Free the floor even if a phone never reports back (≈ reading time + margin).
      const chars = voiced.reduce((n, v) => n + v.text.length, 0);
      setPhase(room, 'speaking', speaker, Math.min(30_000, 3000 + chars * 220));
    } else {
      setPhase(room, 'idle');
    }

    console.log(
      `[turn] room=${room.id} speaker=${speaker} stt=${timing.stt}ms llm=${timing.llm}ms tts=${timing.tts}ms total=${Date.now() - started}ms answered_itself=${turn.agent_answered_itself}${turn.alert.type ? ` alert=${turn.alert.type}` : ''}`
    );

    // 6. Memory (in the background; never blocks the conversation).
    if (c.memoryEnabled && c.memoryToken) {
      const toSave: NewMemory[] = [...turn.memories];
      if (speaker === 'LOCAL' && !toSave.some((m) => m.kind === 'said')) {
        const where = c.context ? `${RoomContexts[c.context].label}: ` : '';
        toSave.push({ kind: 'said', text: `${where}the local said "${said}"${turn.say_to_other ? ` (${turn.say_to_other})` : ''}` });
      }
      void saveMemories(c.memoryToken, toSave);
    }
  } catch (e) {
    console.error(`[turn] room=${room.id} speaker=${speaker} failed after ${Date.now() - started}ms:`, (e as Error).message);
    setPhase(room, 'idle');
    send(from.socket, {
      t: 'error',
      code: 'ai_failed',
      message: from.role === 'local' ? '抱歉，出了点问题，请再说一次。' : 'Hao had a problem with that turn. Please try again.',
    });
  }
}

/** When the room closes, keep the outcome (e.g. the order) in the user's memory. */
export function rememberSummary(room: Room) {
  const c = room.conversation;
  if (!c.memoryEnabled || !c.memoryToken || !c.summary?.items.length) return;
  const where = c.context ? `${RoomContexts[c.context].label}: ` : '';
  const text = `${where}${c.summary.title} – ${c.summary.items.join('; ')}${c.summary.total ? ` (total ${c.summary.total})` : ''}`;
  void saveMemories(c.memoryToken, [{ kind: 'note', text }]);
}
