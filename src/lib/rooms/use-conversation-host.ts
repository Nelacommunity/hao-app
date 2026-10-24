import { useCallback, useEffect, useRef, useState } from 'react';

import type { AudioInput, LanguageTarget, RoomSpeaker, RoomTurnLine } from '@shared/ai/types';
import type { ConvCaption, PhaseState, RoomAlert, RoomContext, RoomSummary, ServerMessage } from '@shared/rooms/protocol';
import { cleanName, type GuestEnvelope } from '@shared/rooms/realtime';

import { roomApi, type RoomApi } from '@/lib/rooms/api';
import { useHostChannel } from '@/lib/rooms/channel';
import { playVoice } from '@/lib/rooms/voice';

const MAX_CAPTIONS = 60;
const RECENT_LINES = 12; // ≈ the last 6 turns
const IDLE_MS = 5 * 60_000;
const LISTEN_TIMEOUT_MS = 30_000;
const MANDARIN: LanguageTarget = { code: 'zh', name: 'Mandarin Chinese' };

const SPEECH_TAGS: Record<string, string> = {
  zh: 'zh-CN', 'zh-TW': 'zh-TW', yue: 'zh-HK', en: 'en-US', ja: 'ja-JP', ko: 'ko-KR', ru: 'ru-RU', ar: 'ar-SA', fr: 'fr-FR', es: 'es-ES',
};
const speechTag = (code: string) => SPEECH_TAGS[code] ?? code;
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

type Options = {
  code: string | null;
  userLanguage: LanguageTarget & { speech: string };
  /** The host's name, shown on the guest's page. */
  userName?: string;
  initialContext: RoomContext | null;
  api?: RoomApi;
};

/**
 * Runs a live conversation room on the host's phone: one person talks at a time, each turn goes
 * speech-to-text → Hao agent → Hao's voice on the other phone, streamed so Hao starts talking as soon as
 * its first line is written. The guest (web page) is reached over
 * Supabase Realtime; alerts, whispers and the summary never leave this phone.
 */
export function useConversationHost({ code, userLanguage, userName, initialContext, api = roomApi }: Options) {
  const [captions, setCaptions] = useState<ConvCaption[]>([]);
  const [whispers, setWhispers] = useState<{ id: string; whisper: string; at: number }[]>([]);
  const [alerts, setAlerts] = useState<RoomAlert[]>([]);
  const [summary, setSummary] = useState<RoomSummary | null>(null);
  const [context, setContextState] = useState<RoomContext | null>(initialContext);
  const [phase, setPhaseState] = useState<PhaseState>({ phase: 'idle', by: null });
  const [notice, setNotice] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  // What the guest asked to be called on the join page (from their messages; presence also carries it).
  const [messageName, setMessageName] = useState<string | null>(null);

  // Mutable room state the async turn pipeline reads (refs avoid stale closures).
  const r = useRef({
    phase: { phase: 'idle', by: null } as PhaseState,
    phaseTimer: null as ReturnType<typeof setTimeout> | null,
    localCaptions: [] as ConvCaption[],
    recent: [] as RoomTurnLine[],
    summary: null as RoomSummary | null,
    context: initialContext,
    introduced: false,
    awaiting: new Set<string>(),
    lastTurnAt: 0,
    local: null as { pid: string; language: LanguageTarget; name: string | null } | null,
    ended: false,
    /** A turn is still streaming: early speech finishing must not free the floor yet. */
    turnPending: false,
  });

  const onGuestRef = useRef<(env: GuestEnvelope) => void>(() => {});
  const { connected, presence, send } = useHostChannel(code, 'conversation', (env) => onGuestRef.current(env), userName);
  const localPresent = presence.find((p) => p.role === 'local');

  // Learn the guest's id, language and name from presence too (they may not have sent anything since this screen opened).
  const presentName = cleanName(localPresent?.name) || null;
  useEffect(() => {
    if (localPresent && !r.current.local) {
      r.current.local = { pid: localPresent.pid, language: localPresent.language ?? MANDARIN, name: presentName };
    }
    if (presentName && r.current.local) r.current.local.name = presentName;
  }, [localPresent, presentName]);
  const localName = presentName ?? messageName;

  const toLocal = useCallback((msg: ServerMessage) => send({ to: 'local', msg }), [send]);

  const setPhase = useCallback(
    (phase: PhaseState['phase'], by: RoomSpeaker | null = null, timeoutMs = 0) => {
      const s = r.current;
      const apply = (next: PhaseState['phase'], who: RoomSpeaker | null, ms: number) => {
        if (s.phaseTimer) clearTimeout(s.phaseTimer);
        // A turn that never completes (lost playback report, stuck mic) frees the floor on its own.
        s.phaseTimer = ms ? setTimeout(() => apply('idle', null, 0), ms) : null;
        if (next === 'idle') s.awaiting.clear();
        s.phase = { phase: next, by: who };
        setPhaseState(s.phase);
        send({ to: 'all', msg: { t: 'phase', state: s.phase } });
      };
      apply(phase, by, timeoutMs);
    },
    [send]
  );

  const caption = useCallback(
    (view: 'host' | 'local', line: Omit<ConvCaption, 'id' | 'at'>) => {
      const c: ConvCaption = { ...line, id: uid(), at: Date.now() };
      if (view === 'host') setCaptions((list) => [...list, c].slice(-MAX_CAPTIONS));
      else {
        r.current.localCaptions = [...r.current.localCaptions, c].slice(-MAX_CAPTIONS);
        toLocal({ t: 'conv_caption', caption: c });
      }
    },
    [toLocal]
  );

  const played = useCallback(
    (who: string) => {
      const s = r.current;
      s.awaiting.delete(who);
      if (s.phase.phase === 'speaking' && s.awaiting.size === 0 && !s.turnPending) setPhase('idle');
    },
    [setPhase]
  );

  const runTurn = useCallback(
    async (speaker: RoomSpeaker, input: { audio?: AudioInput; text?: string }) => {
      const s = r.current;
      if (s.ended) return;
      const busy = s.phase.phase === 'thinking' || s.phase.phase === 'speaking' || (s.phase.phase === 'listening' && s.phase.by !== speaker);
      if (busy) {
        if (speaker === 'LOCAL') toLocal({ t: 'error', code: 'busy', message: '请稍等，Hao 正在说话…' });
        return;
      }
      setPhase('thinking', speaker, 45_000);
      s.lastTurnAt = Date.now();
      const localLanguage = s.local?.language ?? MANDARIN;
      const other: RoomSpeaker = speaker === 'USER' ? 'LOCAL' : 'USER';

      // The turn streams in: what was said, then the line for the other person, then the rest.
      let saidShown = false;
      let spokenEarly = false;
      const showSaid = (said: string) => {
        if (saidShown || s.ended) return;
        saidShown = true;
        caption('host', { speaker, text: said });
        if (speaker === 'LOCAL') caption('local', { speaker, text: said });
        s.recent.push({ speaker, text: said });
      };
      const speak = (to: RoomSpeaker, text: string) => {
        if (to === 'LOCAL') s.introduced = true;
        s.recent.push({ speaker: 'AGENT', to, text });
        caption('host', { speaker: 'AGENT', to, text });
        if (to === 'LOCAL') {
          caption('local', { speaker: 'AGENT', to: 'LOCAL', text });
          if (s.local) {
            s.awaiting.add(s.local.pid);
            toLocal({ t: 'voice', id: uid(), text, lang: speechTag(localLanguage.code), audio: null });
          }
        } else {
          s.awaiting.add('host');
          playVoice({ id: uid(), text, audio: null }, userLanguage.speech, () => played('host'));
        }
      };
      const speakingFor = (chars: number) => Math.min(30_000, 3000 + chars * 220);

      s.turnPending = true;
      try {
        const res = await api.turn(
          {
            speaker,
            ...input,
            userLanguage: { code: userLanguage.code, name: userLanguage.name },
            localLanguage,
            localName: s.local?.name ?? null,
            context: s.context,
            recent: s.recent.slice(-RECENT_LINES),
            introduced: s.introduced,
            summary: s.summary,
          },
          {
            onSaid: showSaid,
            onSay: (text) => {
              if (s.ended || spokenEarly) return;
              spokenEarly = true;
              s.awaiting.clear();
              speak(other, text);
              if (s.awaiting.size) setPhase('speaking', speaker, speakingFor(text.length));
            },
          }
        );
        s.turnPending = false;
        if (!res.said || !res.turn) {
          if (speaker === 'LOCAL') toLocal({ t: 'not_heard' });
          else setNotice('Didn’t catch that, tap and try again.');
          return setPhase('idle');
        }
        const turn = res.turn;
        showSaid(res.said);

        // Private to the user's phone.
        if (turn.whisper_to_user) setWhispers((w) => [...w, { id: uid(), whisper: turn.whisper_to_user, at: Date.now() }].slice(-20));
        if (turn.alert.type) {
          const alert = { type: turn.alert.type, message: turn.alert.message, at: Date.now() };
          setAlerts((a) => [...a, alert].slice(-20));
        }
        if (turn.summary_update) {
          s.summary = turn.summary_update;
          setSummary(turn.summary_update);
        }

        // What Hao says aloud, and to whom (the line for the other person may already be playing).
        if (!spokenEarly) {
          s.awaiting.clear();
          if (turn.say_to_other) speak(other, turn.say_to_other);
        }
        if (turn.say_to_speaker) speak(speaker, turn.say_to_speaker);
        if (s.recent.length > RECENT_LINES * 2) s.recent.splice(0, s.recent.length - RECENT_LINES * 2);
        if (s.awaiting.size) setPhase('speaking', speaker, speakingFor(turn.say_to_other.length + turn.say_to_speaker.length));
        else setPhase('idle');
      } catch (e) {
        s.turnPending = false;
        setPhase('idle');
        if (speaker === 'LOCAL') toLocal({ t: 'error', code: 'ai_failed', message: '抱歉，出了点问题，请再说一次。' });
        else setNotice(e instanceof Error ? e.message : 'Hao had a problem with that turn.');
      }
    },
    [api, caption, played, setPhase, toLocal, userLanguage]
  );

  const claimMic = useCallback(
    (speaker: RoomSpeaker, active: boolean) => {
      const s = r.current;
      if (active) {
        if (s.phase.phase !== 'idle' && !(s.phase.phase === 'listening' && s.phase.by === speaker)) return false;
        setPhase('listening', speaker, LISTEN_TIMEOUT_MS);
        return true;
      }
      if (s.phase.phase === 'listening' && s.phase.by === speaker) setPhase('idle');
      return true;
    },
    [setPhase]
  );

  // Messages from the guest's web page.
  useEffect(() => {
    onGuestRef.current = (env) => {
      const s = r.current;
      if (env.role !== 'local' || s.ended) return;
      if (s.local && s.local.pid !== env.from) {
        // Only one guest per conversation; a second phone gets told the room is taken.
        return send({ to: { pid: env.from }, msg: { t: 'error', code: 'room_full', message: '这个二维码已被另一部手机使用。' } });
      }
      const name = cleanName(env.name) || s.local?.name || null;
      s.local = { pid: env.from, language: env.language ?? s.local?.language ?? MANDARIN, name };
      if (name) setMessageName(name);
      const msg = env.msg;
      switch (msg.t) {
        case 'hello':
          // (Re)joined: send the guest's captions and the current turn state.
          return send({
            to: { pid: env.from },
            msg: {
              t: 'welcome',
              room: { id: code ?? '', type: 'conversation', expiresAt: 0 },
              you: { id: env.from, role: 'local' },
              snapshot: { kind: 'conversation_local', captions: s.localCaptions, phase: s.phase },
            },
          });
        case 'mic':
          if (!claimMic('LOCAL', !!msg.active)) toLocal({ t: 'error', code: 'busy', message: '请稍等，Hao 正在说话…' });
          return;
        case 'audio':
          return void runTurn('LOCAL', { audio: msg.audio });
        case 'text':
          return void runTurn('LOCAL', { text: msg.text });
        case 'played':
          return played(env.from);
      }
    };
  }, [claimMic, code, played, runTurn, send, toLocal]);

  const end = useCallback(
    (reason: 'host_ended' | 'idle' = 'host_ended') => {
      const s = r.current;
      if (s.ended) return;
      s.ended = true;
      send({ to: 'all', msg: { t: 'ended', reason } });
      setEnded(true);
    },
    [send]
  );

  // Close after 5 quiet minutes.
  useEffect(() => {
    r.current.lastTurnAt = Date.now();
    const id = setInterval(() => {
      if (Date.now() - r.current.lastTurnAt > IDLE_MS) end('idle');
    }, 15_000);
    return () => clearInterval(id);
  }, [end]);

  const setContext = useCallback((next: RoomContext | null) => {
    r.current.context = next;
    setContextState(next);
  }, []);

  return {
    connected,
    localConnected: !!localPresent,
    localName,
    captions,
    whispers,
    alerts,
    summary,
    context,
    phase,
    notice,
    setNotice,
    ended,
    setContext,
    end,
    /** The user's own turn. */
    claimMic: (active: boolean) => claimMic('USER', active),
    sendAudio: (audio: AudioInput) => runTurn('USER', { audio }),
    sendText: (text: string) => runTurn('USER', { text }),
  };
}
