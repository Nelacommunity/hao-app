import { authenticate, BODY_LIMIT, providerOrError, tooLarge } from '@/lib/server/api';
import { allow, tooMany } from '@/lib/server/rate-limit';

/** Tour broadcast: a listener's question, translated into Chinese for the guide. */
export async function POST(request: Request) {
  const big = tooLarge(request, BODY_LIMIT.text);
  if (big) return big;
  const user = await authenticate(request);
  if (!user) return Response.json({ error: 'Please sign in.' }, { status: 401 });
  if (!(await allow(`translate:${user.id}`, 30))) return tooMany();
  const created = providerOrError();
  if ('error' in created) return created.error;

  let body: { text: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 300) : '';
  if (!text) return Response.json({ error: 'Empty question' }, { status: 400 });
  try {
    return Response.json(await created.provider.translate({ text, target: { code: 'zh', name: 'Mandarin Chinese' } }));
  } catch (e) {
    console.error('Translate failed', e);
    return Response.json({ error: 'Translate failed' }, { status: 502 });
  }
}
