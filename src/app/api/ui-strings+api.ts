import { CATALOG, CATALOG_HASH } from '@shared/i18n/catalog.generated';

import { Languages } from '@/lib/languages';
import { adminClient } from '@/lib/server/admin';
import { authenticate, providerOrError } from '@/lib/server/api';

type Strings = Record<string, string>;

const BATCH = 60;
const PARALLEL = 4;
const CUSTOM_PER_USER_PER_DAY = 3;
const RETRY_AFTER_FAILURE_MS = 10 * 60_000;

// Per server process: finished languages, translations in progress, and recent failures.
const cache = new Map<string, Strings>();
const inFlight = new Map<string, Promise<Strings>>();
const failedAt = new Map<string, number>();
const customByUser = new Map<string, number[]>();

const onlyCatalog = (strings: Strings) => Object.fromEntries(CATALOG.filter((s) => strings[s]).map((s) => [s, strings[s]]));

/**
 * The app's UI text in one language. Served from Supabase when already translated; otherwise the app's
 * own string catalog (never text from the request) is translated once, stored for everyone, and returned.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = (url.searchParams.get('lang') ?? '').trim().slice(0, 80);
  if (!code || code === 'en') return ok({}, true);

  const known = Languages.find((l) => l.code === code);
  const customName = (url.searchParams.get('name') ?? '').replace(/[^\p{L}\p{M} '-]/gu, '').trim().slice(0, 40);
  if (!known && !(code.startsWith('custom:') && customName.length >= 2)) {
    return Response.json({ error: 'Unknown language.' }, { status: 400 });
  }
  const language = { code, name: known?.name ?? customName };

  const hit = cache.get(code);
  if (hit) return ok(hit, true);

  const db = adminClient();
  if (!db) {
    return Response.json(
      { error: 'UI translation is not set up: add SUPABASE_SECRET_KEY to .env and restart Expo.' },
      { status: 503 }
    );
  }
  const { data: row } = await db.from('ui_translations').select('strings, catalog_hash').eq('lang', code).maybeSingle();
  const stored = (row?.strings ?? {}) as Strings;
  if (row?.catalog_hash === CATALOG_HASH) {
    const strings = onlyCatalog(stored);
    cache.set(code, strings);
    return ok(strings, true);
  }

  // Something to translate. Limit who can make that happen.
  if (Date.now() - (failedAt.get(code) ?? 0) < RETRY_AFTER_FAILURE_MS) return ok(onlyCatalog(stored), false);
  if (!known) {
    // A custom language costs tokens for a language nobody else may use: signed-in users, a few per day.
    const user = await authenticate(request);
    if (!user) return Response.json({ error: 'Sign in to translate the app into a custom language.' }, { status: 401 });
    if (!inFlight.has(code) && !row) {
      const recent = (customByUser.get(user.id) ?? []).filter((t) => Date.now() - t < 86_400_000);
      if (recent.length >= CUSTOM_PER_USER_PER_DAY) return Response.json({ error: 'Too many new languages today.' }, { status: 429 });
      customByUser.set(user.id, [...recent, Date.now()]);
    }
  }

  let job = inFlight.get(code);
  if (!job) {
    job = translateMissing(language, stored).finally(() => inFlight.delete(code));
    inFlight.set(code, job);
  }
  try {
    const strings = await job;
    return ok(strings, cache.has(code));
  } catch (e) {
    console.error('[ui-strings] translation failed', code, e);
    return ok(onlyCatalog(stored), false);
  }
}

async function translateMissing(language: { code: string; name: string }, stored: Strings): Promise<Strings> {
  const created = providerOrError();
  if ('error' in created) throw new Error('AI provider is not configured');
  const missing = CATALOG.filter((s) => !stored[s]);
  const batches: string[][] = [];
  for (let i = 0; i < missing.length; i += BATCH) batches.push(missing.slice(i, i + BATCH));

  const strings: Strings = { ...stored };
  let failed = false;
  const t0 = Date.now();
  for (let i = 0; i < batches.length; i += PARALLEL) {
    await Promise.all(
      batches.slice(i, i + PARALLEL).map(async (batch) => {
        try {
          const out = await created.provider.translateUi({ strings: batch, target: language });
          batch.forEach((source, j) => {
            if (out[j] && out[j] !== source) strings[source] = out[j];
          });
        } catch (e) {
          failed = true;
          console.warn('[ui-strings] batch failed', language.code, e);
        }
      })
    );
  }
  const result = onlyCatalog(strings);
  // Strings the model kept in English (names, brands) count as done so they're not re-sent every time.
  const done = failed ? strings : Object.fromEntries(CATALOG.map((s) => [s, strings[s] ?? s]));
  const { error } = await adminClient()!
    .from('ui_translations')
    .upsert({
      lang: language.code,
      language_name: language.name,
      strings: done,
      catalog_hash: failed ? '' : CATALOG_HASH,
      updated_at: new Date().toISOString(),
    });
  if (error) console.error('[ui-strings] could not save', language.code, error.message);
  console.log(`[ui-strings] ${language.code}: translated ${missing.length} strings in ${Date.now() - t0} ms${failed ? ' (some failed)' : ''}`);
  if (failed) failedAt.set(language.code, Date.now());
  else cache.set(language.code, result);
  return result;
}

/** `complete` is false while some strings are still missing, so the app asks again later. */
const ok = (strings: Strings, complete: boolean) =>
  Response.json({ strings, hash: CATALOG_HASH, complete }, { headers: complete ? { 'Cache-Control': 'public, max-age=300' } : {} });
