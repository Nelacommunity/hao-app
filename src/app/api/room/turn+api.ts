import { parsePreferences } from '@shared/ai/preferences';
import { formatMemories } from '@shared/ai/prompts';
import type { AudioInput, LanguageTarget, NewMemory, RoomAgentTurn, RoomTurnLine } from '@shared/ai/types';
import { RoomContexts, type RoomContext, type RoomSummary } from '@shared/rooms/protocol';

import { authenticate, providerOrError } from '@/lib/server/api';
import { recallMemories, remember, userClient } from '@/lib/server/memory';
import { allow, tooMany } from '@/lib/server/rate-limit';

type TurnRequest = {
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

export type TurnEvent =
  | { t: 'said'; said: string }
  | { t: 'say'; text: string }
  | { t: 'done'; said: string; turn: RoomAgentTurn | null; timing: { stt: number; llm: number } }
  | { t: 'error'; error: string };

const MAX_AUDIO_BASE64 = 6 * 1024 * 1024;
const lang = (l: LanguageTarget | undefined, fallback: LanguageTarget) =>
  l && typeof l.code === 'string' && typeof l.name === 'string' ? { code: l.code.slice(0, 32), name: l.name.slice(0, 64) } : fallback;

/** One live-room turn: speech to text → Hao agent (with profile + memory) → save memories, streamed as it happens. */
export async function POST(request: Request) {
  const user = await authenticate(request);
  const db = userClient(request);
  if (!user || !db) return Response.json({ error: 'Please sign in.' }, { status: 401 });
  if (!allow(user.id, 40)) return tooMany();
  const created = providerOrError();
  if ('error' in created) return created.error;
  const { provider } = created;

  let body: TurnRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (body.speaker !== 'USER' && body.speaker !== 'LOCAL') return Response.json({ error: 'Invalid speaker' }, { status: 400 });
  const audio = body.audio && typeof body.audio.data === 'string' && body.audio.data.length <= MAX_AUDIO_BASE64 ? body.audio : undefined;
  const userLanguage = lang(body.userLanguage, { code: 'en', name: 'English' });
  const localLanguage = lang(body.localLanguage, { code: 'zh', name: 'Mandarin Chinese' });
  const context = body.context && body.context in RoomContexts ? body.context : null;

  const timing = { stt: 0, llm: 0 };
  const recent = (body.recent ?? []).slice(-12).map((l) => ({ speaker: l.speaker, to: l.to, text: String(l.text).slice(0, 500) }));
  // Profile (from the database as this user, not from the request) and memories load while speech is transcribed.
  // Memories are looked up from the recent conversation, so they don't wait for this turn's words.
  const profileReq = db.from('profiles').select('display_name, preferences, memory_enabled').eq('id', user.id).single();
  const recallQuery = [context ? RoomContexts[context].label : '', ...recent.slice(-4).map((l) => l.text)].join(' ');
  const memoriesReq = (async () => {
    const { data } = await profileReq;
    return (data?.memory_enabled ?? true) ? formatMemories(await recallMemories(db, recallQuery, 15)) : undefined;
  })().catch(() => undefined);

  // NDJSON stream: `said` as soon as speech is transcribed, `say` (the line Hao speaks to the other person)
  // as soon as the model writes it, then `done` with the full turn. Phones start talking before the turn ends.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: TurnEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        const typed = typeof body.text === 'string' ? body.text.trim().slice(0, 1000) : '';
        if (!typed && !audio) return emit({ t: 'done', said: '', turn: null, timing });
        const t = Date.now();
        let firstSay = 0;

        // For speech, the agent listens to the audio itself while a light model transcribes it in parallel
        // (one round trip instead of two). The transcript is the caption, and the guard: if it heard no
        // speech, the agent's reply is dropped, because a model given context can "hear" words in noise.
        let heard: string | null = audio ? null : typed;
        let heldSay: string | null = null;
        const onSay = (text: string) => {
          if (heard === null) heldSay = text;
          else if (heard) {
            firstSay = Date.now() - t;
            emit({ t: 'say', text });
          }
        };
        const agentTurn = async (said: string) => {
          const [{ data: profile }, memories] = await Promise.all([profileReq, memoriesReq]);
          const turn = await provider.roomAgentTurn(
            {
              userName: profile?.display_name || user.email?.split('@')[0] || 'my friend',
              userLanguage,
              localLanguage,
              preferences: parsePreferences(profile?.preferences),
              context: context ? RoomContexts[context].label : null,
              recent,
              introduced: !!body.introduced,
              summary: body.summary ?? null,
              memories,
              speaker: body.speaker,
              said,
              audio: said ? undefined : audio,
            },
            onSay
          );
          return { turn, memoryOn: profile?.memory_enabled ?? true };
        };
        const turnReq = agentTurn(typed);
        turnReq.catch(() => {}); // awaited below; this only stops an unhandled rejection if transcription fails first

        if (audio && !typed) {
          const transcript = await provider.transcribe({ audio, expected: [userLanguage, localLanguage] });
          timing.stt = Date.now() - t;
          heard = transcript.text;
          if (!heard) {
            return emit({ t: 'done', said: '', turn: null, timing });
          }
        }
        const said = heard ?? '';
        emit({ t: 'said', said });
        if (heldSay) onSay(heldSay);

        let { turn, memoryOn } = await turnReq;
        // The transcriber heard words but the listening agent did not: answer from the transcript instead.
        if (!typed && !turn.say_to_other && !turn.say_to_speaker) ({ turn, memoryOn } = await agentTurn(said));
        timing.llm = Date.now() - t;
        console.log(`[turn] user=${user.id.slice(0, 8)} speaker=${body.speaker} stt=${timing.stt}ms say=${firstSay}ms llm=${timing.llm}ms`);
        emit({ t: 'done', said, turn, timing });

        if (memoryOn) {
          const toSave: NewMemory[] = [...turn.memories];
          if (body.speaker === 'LOCAL' && !toSave.some((m) => m.kind === 'said')) {
            const where = context ? `${RoomContexts[context].label}: ` : '';
            toSave.push({ kind: 'said', text: `${where}the local said "${said}"${turn.say_to_other ? ` (${turn.say_to_other})` : ''}` });
          }
          void remember(db, toSave, 'interpret');
        }
      } catch (e) {
        console.error('Room turn failed', e);
        emit({ t: 'error', error: 'Hao had a problem with that turn. Please try again.' });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' } });
}
