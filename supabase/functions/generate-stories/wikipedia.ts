// English Wikipedia text and lead photos for culture stories. Text is CC BY-SA (credited on the story);
// a photo is used only when Wikimedia Commons lists a free licence, and is copied to the story-images
// bucket because Wikipedia and Wikimedia are blocked in mainland China.
import type { WikiFact } from '../../../shared/stories/facts.ts';

const API = 'https://en.wikipedia.org/w/api.php';
// Wikimedia asks every client to identify itself.
const HEADERS = { 'User-Agent': `HaoDiscover/1.0 (story generator; ${Deno.env.get('WIKIMEDIA_CONTACT') || 'contact via the Hao team'})` };
const FREE_LICENCE = /^(cc0|cc by(-sa)?( \d\.\d)?|public domain|pd)/i;

const stripHtml = (html: string) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

async function api<T>(params: Record<string, string>): Promise<T> {
  const url = new URL(API);
  for (const [k, v] of Object.entries({ ...params, format: 'json', formatversion: '2', origin: '*' })) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Wikipedia ${res.status}`);
  return (await res.json()) as T;
}

/** Saves an image and returns its public URL, or null. */
export type ImageStore = (path: string, bytes: Uint8Array, contentType: string) => Promise<string | null>;

/** The article's opening text (and a free lead photo, re-hosted), or null if there's no such article. */
export async function wikipediaFact(topic: { topicId: string; title: string }, store: ImageStore | null): Promise<WikiFact | null> {
  type Page = { title: string; missing?: boolean; extract?: string; pageimage?: string; fullurl?: string };
  const data = await api<{ query?: { pages?: Page[] } }>({
    action: 'query',
    titles: topic.title,
    redirects: '1',
    prop: 'extracts|pageimages|info',
    explaintext: '1',
    exsectionformat: 'plain',
    exchars: '3000',
    piprop: 'name',
    inprop: 'url',
  });
  const page = data.query?.pages?.[0];
  if (!page || page.missing || !page.extract) return null;

  const fact: WikiFact = {
    topicId: topic.topicId,
    title: page.title,
    url: page.fullurl ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
    // Up to the first section heading after the introduction is usually enough, and safer.
    extract: page.extract.split(/\n\s*\n(?=[A-Z][^\n]{0,60}\n)/)[0].trim().slice(0, 3000),
  };

  if (page.pageimage && store) {
    fact.image = (await leadImage(page.pageimage, store).catch(() => null)) ?? undefined;
  }
  return fact;
}

async function leadImage(file: string, store: ImageStore) {
  type Info = { thumburl?: string; mime?: string; extmetadata?: Record<string, { value?: string }> };
  const data = await api<{ query?: { pages?: { imageinfo?: Info[] }[] } }>({
    action: 'query',
    titles: `File:${file}`,
    prop: 'imageinfo',
    iiprop: 'url|mime|extmetadata',
    iiurlwidth: '1080',
  });
  const info = data.query?.pages?.[0]?.imageinfo?.[0];
  const licence = stripHtml(info?.extmetadata?.LicenseShortName?.value ?? '');
  if (!info?.thumburl || !FREE_LICENCE.test(licence) || !/^image\/(jpeg|png|webp)$/.test(info.mime ?? '')) return null;
  const artist = stripHtml(info.extmetadata?.Artist?.value ?? '').slice(0, 80) || 'Unknown author';

  const res = await fetch(info.thumburl, { headers: HEADERS, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) return null;
  const type = (res.headers.get('content-type') ?? 'image/jpeg').split(';')[0].trim();
  if (!/^image\/(jpeg|png|webp)$/.test(type)) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > 5_000_000) return null;
  const path = `wikimedia/${file.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120)}.${type.split('/')[1].replace('jpeg', 'jpg')}`;
  const url = await store(path, bytes, type);
  return url ? { url, credit: `${artist} · ${licence} · Wikimedia Commons` } : null;
}

/** Placeholder articles for local runs without network (STORIES_MOCK=true). */
export function mockWikipediaFact(topic: { topicId: string; title: string }): WikiFact {
  return {
    topicId: topic.topicId,
    title: topic.title,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(topic.title)}`,
    extract: `[PLACEHOLDER] ${topic.title} is a Chinese tradition. `.repeat(12),
  };
}
