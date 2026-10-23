import type { AudioInput, LanguageTarget } from '@shared/ai/types';

import { authenticate, providerOrError } from '@/lib/server/api';
import { allow, tooMany } from '@/lib/server/rate-limit';

const MANDARIN: LanguageTarget = { code: 'zh', name: 'Mandarin Chinese' };

/** Tour broadcast: transcribe a chunk once and translate it once per language present. */
export async function POST(request: Request) {
  const user = await authenticate(request);
  if (!user) return Response.json({ error: 'Please sign in.' }, { status: 401 });
  if (!allow(`caption:${user.id}`, 30)) return tooMany();
  const created = providerOrError();
  if ('error' in created) return created.error;

  let body: { audio: AudioInput; targets: LanguageTarget[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body.audio?.data || body.audio.data.length > 6 * 1024 * 1024) return Response.json({ error: 'Invalid audio' }, { status: 400 });
  const targets = (body.targets ?? [])
    .filter((t) => typeof t?.code === 'string' && typeof t?.name === 'string')
    .slice(0, 12)
    .map((t) => ({ code: t.code.slice(0, 32), name: t.name.slice(0, 64) }));

  const started = Date.now();
  try {
    const result = await created.provider.transcribeAndTranslate({ audio: body.audio, sourceLanguage: MANDARIN, targets });
    console.log(`[caption] user=${user.id.slice(0, 8)} langs=${targets.map((t) => t.code).join(',') || '-'} ms=${Date.now() - started}`);
    return Response.json(result);
  } catch (e) {
    console.error('Caption failed', e);
    return Response.json({ error: 'Caption failed' }, { status: 502 });
  }
}
