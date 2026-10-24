import { CultureItems, Festivals, SolarTerms, ZodiacYears, type CultureItem, type Festival, type SolarTerm } from '@/data/culture';
import { Dishes, type Dish } from '@/data/food';
import { PhraseGroups, type Phrase } from '@/data/phrases';
import type { Place } from '@/data/places';

export type Upcoming = { kind: 'festival'; item: Festival; days: number } | { kind: 'term'; item: SolarTerm; days: number };

export type TodayInfo = {
  date: Date;
  /** e.g. 九月十二, or null where the device can't compute the Chinese calendar. */
  lunar: string | null;
  festival: Festival | null;
  term: SolarTerm | null;
  upcoming: Upcoming[];
  zodiac: (typeof ZodiacYears)[number] | null;
};

export type ReelCard =
  | { kind: 'today'; id: string; today: TodayInfo }
  | { kind: 'place'; id: string; place: Place; daily?: boolean }
  | { kind: 'dish'; id: string; dish: Dish; daily?: boolean }
  | { kind: 'culture'; id: string; item: CultureItem; daily?: boolean }
  | { kind: 'festival'; id: string; item: Festival; days: number }
  | { kind: 'phrase'; id: string; phrase: Phrase; group: string };

const DAY = 86_400_000;
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const daysBetween = (a: Date, b: Date) => Math.round((midnight(b).getTime() - midnight(a).getTime()) / DAY);

const DIGITS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
function lunarDay(n: number) {
  if (n <= 10) return `初${DIGITS[n]}`;
  if (n < 20) return `十${DIGITS[n - 10]}`;
  if (n === 20) return '二十';
  if (n < 30) return `廿${DIGITS[n - 20]}`;
  return '三十';
}

function lunarDate(d: Date): string | null {
  try {
    const text = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { month: 'long', day: 'numeric' }).format(d);
    // Engines without the Chinese calendar fall back to Gregorian ("10月22日"): don't show that as lunar.
    const m = /([闰]?[正一二三四五六七八九十冬腊]+月)(\d+)/.exec(text);
    if (!m) return null;
    // Some engines print the day as digits ("九月13日"); traditional style is 初一…三十.
    return `${m[1]}${lunarDay(Number(m[2]))}`;
  } catch {
    return null;
  }
}

export function todayInChina(now: Date): TodayInfo {
  const key = ymd(now);
  const upcoming: Upcoming[] = [];
  for (const f of Festivals) {
    for (const date of f.dates) {
      const days = daysBetween(now, new Date(`${date}T00:00:00`));
      if (days > 0 && days <= 60) upcoming.push({ kind: 'festival', item: f, days });
    }
  }
  for (const term of SolarTerms) {
    for (const year of [now.getFullYear(), now.getFullYear() + 1]) {
      const days = daysBetween(now, new Date(year, term.month - 1, term.day));
      if (days > 0 && days <= 30) upcoming.push({ kind: 'term', item: term, days });
    }
  }
  upcoming.sort((a, b) => a.days - b.days);
  return {
    date: now,
    lunar: lunarDate(now),
    festival: Festivals.find((f) => f.dates.includes(key)) ?? null,
    term: SolarTerms.find((t) => t.month === now.getMonth() + 1 && t.day === now.getDate()) ?? null,
    upcoming: upcoming.slice(0, 3),
    zodiac: ZodiacYears.find((z) => key >= z.from && key <= z.to) ?? null,
  };
}

/** Small seeded RNG so everyone sees the same order on a given day, and a new one tomorrow. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = Math.imul(s ^ (s >>> 15), 1 | s);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle<T>(list: T[], random: () => number) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The Discover feed for one day: today's card, the place/dish/culture/phrase of the day, upcoming
 * festivals, then everything else mixed so places, food and culture alternate. `nearby` are AMap
 * places around the user; until they load the feed simply has no place cards.
 */
export function buildFeed(now: Date, nearby: Place[]): ReelCard[] {
  const dayNumber = Math.floor(midnight(now).getTime() / DAY);
  const random = rng(dayNumber * 2654435761);
  const today = todayInChina(now);

  const dishes = shuffle(Dishes, random);
  const culture = shuffle(CultureItems, random);
  // Last, so the dish and culture order stays the same when the places arrive.
  const places = shuffle(nearby, random);
  const phrases = PhraseGroups.flatMap((g) => g.phrases.map((phrase) => ({ phrase, group: g.title })));
  const phrase = phrases[dayNumber % phrases.length];

  const cards: ReelCard[] = [{ kind: 'today', id: 'today', today }];
  if (today.festival) cards.push({ kind: 'festival', id: `festival-${today.festival.id}`, item: today.festival, days: 0 });
  cards.push({ kind: 'culture', id: `culture-${culture[0].id}`, item: culture[0], daily: true });
  if (places[0]) cards.push({ kind: 'place', id: `place-${places[0].id}`, place: places[0], daily: true });
  cards.push({ kind: 'dish', id: `dish-${dishes[0].id}`, dish: dishes[0], daily: true });
  for (const u of today.upcoming) {
    if (u.kind === 'festival') cards.push({ kind: 'festival', id: `festival-${u.item.id}`, item: u.item, days: u.days });
  }
  cards.push({ kind: 'phrase', id: 'phrase', phrase: phrase.phrase, group: phrase.group });

  // The rest: place, culture, place, dish… until everything has been shown once.
  const queues: ReelCard[][] = [
    places.slice(1).map((place) => ({ kind: 'place' as const, id: `place-${place.id}`, place })),
    culture.slice(1).map((item) => ({ kind: 'culture' as const, id: `culture-${item.id}`, item })),
    dishes.slice(1).map((dish) => ({ kind: 'dish' as const, id: `dish-${dish.id}`, dish })),
  ];
  const pattern = [0, 1, 0, 2, 0, 1];
  for (let i = 0; queues.some((q) => q.length); i++) {
    const q = queues[pattern[i % pattern.length]];
    const next = q.shift() ?? queues.find((x) => x.length)?.shift();
    if (next) cards.push(next);
  }
  return cards;
}
