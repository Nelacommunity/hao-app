import { Languages } from '@/lib/languages';
import { adminClient } from '@/lib/server/admin';
import { providerOrError } from '@/lib/server/api';
import { loadKnowledge, loadTopics, rememberTopicTranslations, type TopicRow } from '@/lib/server/guide';

type Translation = { title: string; starter: string };

// Per server process: languages being translated, and recent failures.
const inFlight = new Map<string, Promise<void>>();
const failedAt = new Map<string, number>();
const RETRY_AFTER_FAILURE_MS = 10 * 60_000;

/**
 * What the Guide chat shows from the database: its topic chips (in the traveller's language) and the apps
 * Hao may suggest. Topics are translated once per language with AI and stored on the row for everyone.
 */
export async function GET(request: Request) {
  const code = (new URL(request.url).searchParams.get('lang') ?? 'en').trim().slice(0, 80);
  const [knowledge, rows] = await Promise.all([loadKnowledge(), loadTopics()]);
  const apps = [...knowledge.apps.values()];

  // Only the app's own languages are translated here; custom ones fall back to English.
  const language = Languages.find((l) => l.code === code);
  let complete = true;
  if (language && code !== 'en' && rows.some((r) => !r.translations?.[code])) {
    if (Date.now() - (failedAt.get(code) ?? 0) > RETRY_AFTER_FAILURE_MS) {
      let job = inFlight.get(code);
      if (!job) {
        job = translateTopics(rows, { code, name: language.name }).finally(() => inFlight.delete(code));
        inFlight.set(code, job);
      }
      await job.catch((e) => {
        failedAt.set(code, Date.now());
        console.error('[guide-content] translation failed', code, e);
      });
    }
    complete = rows.every((r) => r.translations?.[code]);
  }

  const topics = rows.map((r) => {
    const t = code === 'en' ? undefined : r.translations?.[code];
    return { id: r.id, emoji: r.emoji, title: t?.title || r.title, starter: t?.starter || r.starter };
  });
  return Response.json(
    { topics, apps, complete },
    { headers: complete && topics.length ? { 'Cache-Control': 'public, max-age=300' } : {} }
  );
}

async function translateTopics(rows: TopicRow[], target: { code: string; name: string }) {
  const created = providerOrError();
  if ('error' in created) throw new Error('AI provider is not configured');
  const missing = rows.filter((r) => !r.translations?.[target.code]);
  const out = await created.provider.translateUi({ strings: missing.flatMap((r) => [r.title, r.starter]), target });
  const byId: Record<string, Translation> = {};
  missing.forEach((r, i) => {
    const title = out[i * 2]?.trim();
    const starter = out[i * 2 + 1]?.trim();
    if (title && starter) byId[r.id] = { title: title.slice(0, 120), starter: starter.slice(0, 400) };
  });

  const db = adminClient();
  if (db) {
    await Promise.all(
      missing
        .filter((r) => byId[r.id])
        .map(async (r) => {
          const { error } = await db
            .from('guide_topics')
            .update({ translations: { ...r.translations, [target.code]: byId[r.id] } })
            .eq('id', r.id);
          if (error) console.error('[guide-content] could not save', r.id, target.code, error.message);
        })
    );
  }
  rememberTopicTranslations(target.code, byId);
}
