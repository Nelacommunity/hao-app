import { useCallback, useEffect, useRef, useState } from 'react';

import type { AudioInput, LanguageTarget } from '@shared/ai/types';
import type { ListenerCounts, Question, TranscriptLine } from '@shared/rooms/protocol';
import type { GuestEnvelope, PresenceMeta } from '@shared/rooms/realtime';

import { roomApi, type RoomApi } from '@/lib/rooms/api';
import { useHostChannel } from '@/lib/rooms/channel';

type Record_ = { seq: number; zh: string; translations: Record<string, string> };
const MAX_CAPTIONS = 200;
const GAP_TIMEOUT_MS = 8000;

/** Languages present right now: translate once per language, not once per listener. */
function languagesOf(presence: PresenceMeta[]): LanguageTarget[] {
  const byCode = new Map<string, LanguageTarget>();
  for (const p of presence) if (p.role === 'listener' && p.language) byCode.set(p.language.code, p.language);
  return [...byCode.values()];
}

/**
 * Runs a tour broadcast on the guide's phone: chunks are captioned through the app's API and pushed to
 * listeners over Supabase Realtime, always in spoken order even when a later chunk finishes first.
 */
export function useBroadcastHost({ code, api = roomApi }: { code: string | null; api?: RoomApi }) {
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);

  const s = useRef({
    nextSeq: 0,
    nextEmit: 0,
    ready: new Map<number, Record_ | null>(),
    processing: new Set<number>(),
    records: [] as Record_[],
    gapTimer: null as ReturnType<typeof setTimeout> | null,
    presence: [] as PresenceMeta[],
  });
  const onGuestRef = useRef<(env: GuestEnvelope) => void>(() => {});
  const { connected, presence, send } = useHostChannel(code, 'broadcast', (env) => onGuestRef.current(env));

  useEffect(() => {
    s.current.presence = presence;
  }, [presence]);

  const counts: ListenerCounts = {};
  for (const p of presence) {
    if (p.role !== 'listener' || !p.language) continue;
    counts[p.language.code] ??= { name: p.language.name, count: 0 };
    counts[p.language.code].count += 1;
  }

  const flush = useCallback(() => {
    const st = s.current;
    const run = () => {
      while (st.ready.has(st.nextEmit)) {
        const rec = st.ready.get(st.nextEmit)!;
        st.ready.delete(st.nextEmit);
        st.nextEmit += 1;
        if (!rec || !rec.zh.trim()) continue;
        st.records = [...st.records, rec].slice(-MAX_CAPTIONS);
        setTranscript((t) => [...t, { seq: rec.seq, zh: rec.zh }].slice(-MAX_CAPTIONS));
        for (const [lang, text] of Object.entries(rec.translations)) {
          if (text) send({ to: { lang }, msg: { t: 'caption', caption: { seq: rec.seq, text } } });
        }
      }
      // A chunk that was never captioned must not block later captions forever.
      if (st.gapTimer) clearTimeout(st.gapTimer);
      st.gapTimer = null;
      if (st.ready.size > 0) {
        st.gapTimer = setTimeout(() => {
          if (!st.processing.has(st.nextEmit)) st.ready.set(st.nextEmit, null);
          run();
        }, GAP_TIMEOUT_MS);
      }
    };
    run();
  }, [send]);

  const sendChunk = useCallback(
    async (audio: AudioInput) => {
      const st = s.current;
      const seq = st.nextSeq++;
      st.processing.add(seq);
      let rec: Record_ | null = null;
      try {
        const result = await api.caption(audio, languagesOf(st.presence));
        rec = { seq, zh: result.transcript, translations: result.translations };
      } catch (e) {
        setError(e instanceof Error ? `A caption chunk was skipped: ${e.message}` : 'A caption chunk was skipped.');
      } finally {
        st.processing.delete(seq);
      }
      if (seq >= st.nextEmit) st.ready.set(seq, rec);
      flush();
    },
    [api, flush]
  );

  useEffect(() => {
    onGuestRef.current = (env) => {
      if (env.role !== 'listener') return;
      const msg = env.msg;
      if (msg.t === 'hello' || msg.t === 'set_language') {
        // (Re)joined or switched language: send their caption history in that language.
        const lang = env.language?.code;
        const captions = lang
          ? s.current.records
              .filter((r) => r.translations[lang])
              .slice(-50)
              .map((r) => ({ seq: r.seq, text: r.translations[lang] }))
          : [];
        send({
          to: { pid: env.from },
          msg: {
            t: 'welcome',
            room: { id: code ?? '', type: 'broadcast', expiresAt: 0 },
            you: { id: env.from, role: 'listener' },
            snapshot: { kind: 'broadcast_listener', captions },
          },
        });
      } else if (msg.t === 'question' && typeof msg.text === 'string' && msg.text.trim()) {
        const original = msg.text.trim().slice(0, 300);
        api
          .translate(original)
          .then((t) => {
            const q: Question = {
              id: `${Date.now()}`,
              original,
              zh: t.text,
              language: env.language?.name ?? t.detectedLanguage,
              at: Date.now(),
            };
            setQuestions((list) => [...list, q].slice(-50));
            send({ to: { pid: env.from }, msg: { t: 'question_sent', ok: true } });
          })
          .catch(() => send({ to: { pid: env.from }, msg: { t: 'question_sent', ok: false } }));
      }
    };
  }, [api, code, send]);

  const end = useCallback(() => {
    send({ to: 'all', msg: { t: 'ended', reason: 'host_ended' } });
    setEnded(true);
  }, [send]);

  return { connected, counts, transcript, questions, error, ended, sendChunk, end };
}
