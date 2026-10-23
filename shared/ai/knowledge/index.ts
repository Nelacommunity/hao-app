// Hao's knowledge base (knowledge/*.md, team doc "Hao Knowledge Base: Newcomer Setup in China").
// Each request gets only the few sections relevant to it, so prompts stay small and fast.
import { EMBASSIES, KNOWLEDGE_REVIEWED, SECTIONS } from './data.generated';
import type { Embassy, KnowledgeSection } from './types';

export { KNOWLEDGE_REVIEWED, type Embassy, type KnowledgeSection };

const STOP = new Set(
  'a an and are as at be but by can do does for from get got have how i if in is it its me my of on or so that the this to was what when where which who why will with you your'.split(' ')
);

// Words people use that the guide spells differently.
const ALIASES: Record<string, string> = {
  weixin: 'wechat', 微信: 'wechat', zhifubao: 'alipay', 支付宝: 'alipay', taxi: 'didi', cab: 'didi', uber: 'didi',
  phone: 'sim', esim: 'sim', mobile: 'sim', internet: 'sim', data: 'sim', vpn: 'sim',
  train: 'trains', railway: 'trains', '12306': 'trains', subway: 'metro', bus: 'transport',
  police: 'registration', registration: 'registration', permit: 'residence', rent: 'housing', apartment: 'housing', landlord: 'housing',
  hospital: 'healthcare', doctor: 'healthcare', sick: 'healthcare', pharmacy: 'healthcare', medicine: 'healthcare', insurance: 'healthcare',
  money: 'payment', pay: 'payment', paying: 'payment', card: 'bank', transfer: 'remittance', wise: 'remittance', send: 'remittance',
  halal: 'food', vegetarian: 'food', vegan: 'food', allergy: 'food', allergic: 'food', restaurant: 'food', order: 'food',
  scam: 'scams', cheated: 'scams', overcharged: 'scams', price: 'prices', embassy: 'embassies', consulate: 'embassies', passport: 'embassies',
  emergency: 'emergencies', lost: 'emergencies', stolen: 'emergencies', arrested: 'laws', illegal: 'laws', drugs: 'laws',
  taobao: 'shopping', jd: 'shopping', meituan: 'apps', eleme: 'apps', delivery: 'apps', mandarin: 'chinese', hsk: 'chinese',
  festival: 'holidays', new: 'new', year: 'year', climate: 'weather', cold: 'weather', hot: 'weather', student: 'students', university: 'university',
};

function tokens(text: string) {
  const out: string[] = [];
  for (const raw of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    if (STOP.has(raw) || raw.length < 2) continue;
    const word = raw.length > 4 && raw.endsWith('s') && !raw.endsWith('ss') ? raw.slice(0, -1) : raw;
    out.push(word);
    const alias = ALIASES[raw] ?? ALIASES[word];
    if (alias && alias !== word) out.push(alias.endsWith('s') ? alias.slice(0, -1) : alias);
  }
  return out;
}

type Indexed = { section: KnowledgeSection; title: Set<string>; tf: Map<string, number>; length: number };

const INDEX: Indexed[] = SECTIONS.map((section) => {
  const tf = new Map<string, number>();
  const words = tokens(section.body);
  for (const w of words) tf.set(w, (tf.get(w) ?? 0) + 1);
  return { section, title: new Set(tokens(section.title)), tf, length: words.length };
});
const AVG_LENGTH = INDEX.reduce((n, d) => n + d.length, 0) / INDEX.length;
const DF = new Map<string, number>();
for (const d of INDEX) for (const w of new Set([...d.tf.keys(), ...d.title])) DF.set(w, (DF.get(w) ?? 0) + 1);

/** BM25 over section bodies, with a strong boost for words in the section title. */
export function searchKnowledge(query: string, limit = 3): KnowledgeSection[] {
  const q = [...new Set(tokens(query))];
  if (!q.length) return [];
  const scored = INDEX.map((d) => {
    let score = 0;
    for (const w of q) {
      const df = DF.get(w);
      if (!df) continue;
      const idf = Math.log(1 + (INDEX.length - df + 0.5) / (df + 0.5));
      const f = d.tf.get(w) ?? 0;
      score += idf * ((f * 2.2) / (f + 1.2 * (0.25 + 0.75 * (d.length / AVG_LENGTH))));
      if (d.title.has(w)) score += idf * 2.5;
    }
    return { section: d.section, score };
  })
    .filter((s) => s.score > 1.5)
    .sort((a, b) => b.score - a.score);
  // Drop weak tail matches so a clear single-topic question gets just its topic.
  const best = scored[0]?.score ?? 0;
  return scored.filter((s) => s.score >= best * 0.35).slice(0, limit).map((s) => s.section);
}

export const sectionById = (id: string) => SECTIONS.find((s) => s.id === id) ?? null;

// Common ways people name their country that don't share its first letters.
const COUNTRY_ALIASES: Record<string, string> = {
  uk: 'United Kingdom', britain: 'United Kingdom', british: 'United Kingdom', england: 'United Kingdom', english: 'United Kingdom', scotland: 'United Kingdom', welsh: 'United Kingdom',
  us: 'United States', usa: 'United States', america: 'United States', american: 'United States',
  french: 'France', dutch: 'Netherlands', holland: 'Netherlands', swiss: 'Switzerland', swedish: 'Sweden', danish: 'Denmark', finnish: 'Finland', polish: 'Poland',
  spanish: 'Spain', portuguese: 'Portugal', greek: 'Greece', irish: 'Ireland', turkish: 'Türkiye', turkey: 'Türkiye', czech: 'Czech Republic', thai: 'Thailand',
  filipino: 'Philippines', pakistani: 'Pakistan', bangladeshi: 'Bangladesh', vietnamese: 'Vietnam', lao: 'Laos', korean: 'Korea (South)', korea: 'Korea (South)',
  japanese: 'Japan', emirati: 'United Arab Emirates', uae: 'United Arab Emirates', saudi: 'Saudi Arabia', kiwi: 'New Zealand', aussie: 'Australia',
  ivorian: "Côte d'Ivoire", malagasy: 'Madagascar', congolese: 'Congo (DR)', drc: 'Congo (DR)', kenyan: 'Kenya', nigerian: 'Nigeria', ghanaian: 'Ghana',
};

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function countryMatch(name: string, text: string) {
  const words = fold(text).match(/[a-z]+/g) ?? [];
  const parts = fold(name).replace(/\(.*?\)/g, '').match(/[a-z]+/g) ?? [];
  const key = parts.filter((p) => !['republic', 'of', 'the', 'and', 'democratic', 'people', 's', 'united', 'state', 'states'].includes(p));
  const phrase = parts.join(' ');
  if (phrase && ` ${words.join(' ')} `.includes(` ${phrase} `)) return true;
  // "Kenyan" → Kenya, "Indonesian" → Indonesia, "German" → Germany (prefix either way, ≥5 letters).
  return key.length > 0 && key.every((k) => words.some((w) => (w.length >= 5 && k.length >= 4 && (w.startsWith(k) || k.startsWith(w))) || w === k));
}

/** Embassies in Beijing for countries named or implied in `text` (e.g. "I'm Kenyan", "the UK embassy"). */
export function findEmbassies(text: string, limit = 2): Embassy[] {
  const found = new Map<string, Embassy>();
  const lower = fold(text);
  for (const [alias, country] of Object.entries(COUNTRY_ALIASES)) {
    if (new RegExp(`\\b${alias}\\b`).test(lower)) {
      const e = EMBASSIES.find((x) => fold(x.country).startsWith(fold(country)));
      if (e) found.set(e.country, e);
    }
  }
  for (const e of EMBASSIES) if (countryMatch(e.country, text)) found.set(e.country, e);
  // "Nigerian" also prefixes Niger: keep the longer name when one match contains another.
  const list = [...found.values()];
  return list.filter((e) => !list.some((o) => o !== e && fold(o.country).startsWith(fold(e.country)))).slice(0, limit);
}

const EMBASSY_WORDS = /\b(embass|consul|passport|arrest|detain|deport|lost|stolen|visa|emergenc)/i;

/**
 * Knowledge for one prompt: the best sections for `query`, plus the user's embassy when the question is
 * about passports, arrests or emergencies and their country is known from the query or `about` (memories).
 */
export function knowledgeFor(query: string, { about = '', limit = 3, maxChars = 12_000 } = {}): string {
  const parts: string[] = [];
  let used = 0;
  for (const s of searchKnowledge(query, limit)) {
    const text = `## ${s.title}\n${s.body}`;
    if (used + text.length > maxChars && parts.length) break;
    parts.push(text.slice(0, maxChars));
    used += text.length;
  }
  if (EMBASSY_WORDS.test(query)) {
    const embassies = findEmbassies(query);
    const list = embassies.length ? embassies : findEmbassies(about, 1);
    if (list.length) {
      parts.push(
        `## Embassy in Beijing\n${list.map((e) => `${e.country}: ${e.phone}, ${e.address}`).join('\n')}\n(From a mobile dial the number as written; from abroad +86 10 then the 8 digits.)`
      );
    }
  }
  return parts.join('\n\n');
}
