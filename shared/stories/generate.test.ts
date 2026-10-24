/// <reference types="node" />
// Story generation with a mocked model and mocked AMap data: no network, no API keys.
// Run: npm run test:stories
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { FactBundle, LovedFact, PlaceFact, TopicRow, WikiFact } from './facts.ts';
import { generateStories, pick, candidates, recentKeysFrom, wikipediaTopics, type GenerationInput, type StoryModel } from './generate.ts';
import type { StoryType } from './schema.ts';

const FACTS: FactBundle = {
  culture: [
    { id: 'gongfu-tea', zh: '功夫茶', pinyin: 'gōngfu chá', title: '[PLACEHOLDER] Gongfu tea', body: '[PLACEHOLDER] about', tip: '[PLACEHOLDER] tip', etiquette: false },
    { id: 'chopsticks', zh: '筷子礼仪', pinyin: 'kuàizi lǐyí', title: '[PLACEHOLDER] Chopsticks', body: '[PLACEHOLDER] about', tip: '[PLACEHOLDER] tip', etiquette: true },
  ],
  festivals: [{ id: 'winter-solstice', zh: '冬至', name: '[PLACEHOLDER] Winter Solstice', body: '[PLACEHOLDER]', tip: '[PLACEHOLDER] tip' }],
  dishes: [
    {
      id: 'roujiamo',
      name: 'Roujiamo',
      nameZh: '肉夹馍',
      pinyin: 'ròu jiā mó',
      region: "Xi'an",
      spice: 0,
      price: '¥10–20',
      tags: ['street'],
      description: '[PLACEHOLDER] Chopped braised pork in a flatbread.',
      orderZh: '[PLACEHOLDER]',
      orderEn: '[PLACEHOLDER]',
    },
  ],
  phrases: [{ group: 'basics', groupTitle: 'Basics', en: 'Hello', zh: '你好', pinyin: 'nǐ hǎo' }],
  knowledge: [{ id: 'weather-and-climate-by-region', title: '[PLACEHOLDER] Weather', body: '[PLACEHOLDER] climate notes' }],
  crafts: [
    {
      id: 'paper-cutting',
      title: '[PLACEHOLDER] Paper cutting',
      zh: '剪纸',
      pinyin: 'jiǎnzhǐ',
      about: '[PLACEHOLDER] about',
      materials: ['[PLACEHOLDER] red paper', '[PLACEHOLDER] scissors'],
      steps: ['[PLACEHOLDER] fold', '[PLACEHOLDER] draw', '[PLACEHOLDER] cut', '[PLACEHOLDER] unfold'],
      tips: ['[PLACEHOLDER] tip'],
    },
  ],
};

const TOPICS: TopicRow[] = [
  ['gongfu-tea', 'culture'],
  ['chopsticks', 'etiquette'],
  ['roujiamo', 'food'],
  ['phrases:basics', 'language'],
  ['holiday', 'festival'],
  ['season:weather', 'season'],
  ['place:attraction', 'place'],
  ['place:food', 'place'],
  ['community', 'community'],
  ['craft:paper-cutting', 'craft'],
].map(([id, category]) => ({ id, category, label: id, enabled: true }));

// Shaped like what the Edge Function builds from AMap /v5/place responses.
const PLACE: PlaceFact = {
  placeId: '00000000-0000-4000-8000-0000000000a1',
  amapId: 'B000TEST01',
  name: '[PLACE NAME]',
  nameZh: '[地点]',
  address: '[ADDRESS]',
  addressZh: '[地址]',
  category: 'landmark',
  typeZh: '风景名胜',
  lat: 39.9,
  lng: 116.4,
  hours: '08:30-17:00',
  tags: [],
  photos: ['https://store.is.autonavi.com/showpic/a.jpg', 'https://store.is.autonavi.com/showpic/b.jpg'],
};
const LOVED: LovedFact = {
  ...PLACE,
  placeId: '00000000-0000-4000-8000-0000000000a2',
  amapId: 'B000TEST02',
  category: 'food',
  name: '[PLACE NAME] 清真牛肉面',
  nationality: 'TZ',
  country: 'Tanzania',
  visitors: 6,
  likes: 5,
};

const VALID = (slides = 3) =>
  JSON.stringify({
    title: '[PLACEHOLDER] title',
    slides: Array.from({ length: slides }, (_, i) => ({ heading: `[PLACEHOLDER] ${i + 1}`, body: '[PLACEHOLDER] A short body.' })),
    action_label: 'Ask Hao more',
  });

/** A model that answers from a script of outputs, recording every prompt it got. */
function mockModel(reply: (prompt: string, call: number) => string): StoryModel & { prompts: string[] } {
  const prompts: string[] = [];
  return {
    name: 'mock-model',
    prompts,
    generate: async ({ prompt }) => {
      prompts.push(prompt);
      return reply(prompt, prompts.length);
    },
  };
}
const slidesAsked = (prompt: string) => Number(/SLIDES: exactly (\d)/.exec(prompt)?.[1] ?? 3);

function input(over: Partial<GenerationInput> = {}): GenerationInput {
  return {
    city: { city: 'Beijing', cityZh: '北京' },
    language: { code: 'en', name: 'English' },
    now: new Date('2026-12-10T18:00:00Z'), // 02:00 on 11 December in China
    facts: FACTS,
    topics: TOPICS,
    recentKeys: new Set(),
    holidays: [
      { id: 'winter-solstice', starts_on: '2026-12-22', ends_on: '2026-12-22', name: '[PLACEHOLDER]', name_zh: '冬至', kind: 'festival', about: '[PLACEHOLDER]', closures: '', crowds: '' },
      { id: 'far-away', starts_on: '2027-05-01', ends_on: '2027-05-05', name: '[PLACEHOLDER]', name_zh: '[节日]', kind: 'public_holiday', about: '[PLACEHOLDER]', closures: '', crowds: '' },
    ],
    weather: [{ date: '2026-12-11', dayWeather: '晴', nightWeather: '晴', dayTemp: 3, nightTemp: -6, wind: '北' }],
    spotlight: [PLACE],
    loved: [LOVED],
    model: mockModel((p) => VALID(slidesAsked(p))),
    budget: { maxCalls: 100, used: 0 },
    autoApproveAll: false,
    ...over,
  };
}

const byType = (stories: { type: StoryType }[]) => new Set(stories.map((s) => s.type));

describe('generation', () => {
  it('writes every story type from the given facts', async () => {
    const { stories, errors } = await generateStories(input());
    assert.deepEqual(errors, []);
    assert.deepEqual(
      [...byType(stories)].sort(),
      ['coming_up', 'culture_moment', 'etiquette_tip', 'food_to_try', 'learn_how', 'phrase_of_the_day', 'place_spotlight', 'season_tip', 'your_people_loved'].sort()
    );
  });

  it('puts only provided facts in the prompt and asks for JSON only', async () => {
    const model = mockModel((p) => VALID(slidesAsked(p)));
    await generateStories(input({ model }));
    const holiday = model.prompts.find((p) => p.includes('STORY TYPE: coming_up'))!;
    assert.match(holiday, /Starts in 11 days, on 2026-12-22/);
    assert.ok(!model.prompts.some((p) => p.includes('far-away')), 'holidays beyond the window are not offered');
  });

  it('auto-approves quick types and drafts the rest', async () => {
    const { stories } = await generateStories(input());
    const status = Object.fromEntries(stories.map((s) => [s.type, s.status]));
    for (const t of ['phrase_of_the_day', 'etiquette_tip', 'season_tip', 'coming_up']) assert.equal(status[t], 'approved', t);
    for (const t of ['culture_moment', 'place_spotlight', 'food_to_try', 'your_people_loved', 'learn_how']) assert.equal(status[t], 'draft', t);
  });

  it('approves everything with the demo flag', async () => {
    const { stories } = await generateStories(input({ autoApproveAll: true }));
    assert.ok(stories.every((s) => s.status === 'approved'));
  });
});

describe('validation', () => {
  it('retries once with the error, then keeps a valid answer', async () => {
    const model = mockModel((p, n) => (n === 1 ? '{"title": "x"}' : VALID(slidesAsked(p))));
    const { stories, errors } = await generateStories(input({ model, perType: { phrase_of_the_day: 1, ...zero(['phrase_of_the_day']) } }));
    assert.equal(stories.length, 1);
    assert.equal(errors.length, 0);
    assert.equal(model.prompts.length, 2);
    assert.match(model.prompts[1], /previous answer was rejected: slides/);
  });

  it('rejects and logs output that stays invalid', async () => {
    const tooLong = JSON.stringify({ title: 'x', slides: [{ heading: Array(12).fill('word').join(' '), body: 'b' }, { heading: 'h', body: 'b' }, { heading: 'h', body: 'b' }], action_label: 'Go' });
    const model = mockModel(() => tooLong);
    const { stories, errors, rejected } = await generateStories(input({ model, perType: { etiquette_tip: 1, ...zero(['etiquette_tip']) } }));
    assert.equal(stories.length, 0);
    assert.equal(rejected, 1);
    assert.equal(model.prompts.length, 2, 'exactly one retry');
    assert.match(errors[0].error, /at most 8 words/);
    assert.equal(errors[0].output, tooLong);
  });

  it('treats a failing model call like invalid output', async () => {
    const model: StoryModel = { name: 'mock', generate: async () => Promise.reject(new Error('[PLACEHOLDER] 503')) };
    const { errors } = await generateStories(input({ model, perType: { season_tip: 1, ...zero(['season_tip']) } }));
    assert.match(errors[0].error, /Model call failed/);
  });
});

describe('dedupe', () => {
  it('skips topics and places used in this city within 14 days', async () => {
    const recent = recentKeysFrom([
      { topics: ['gongfu-tea'], place_id: null },
      { topics: ['place:attraction', 'contains:pork'], place_id: PLACE.placeId },
    ]);
    const { stories } = await generateStories(input({ recentKeys: recent }));
    assert.ok(!stories.some((s) => s.type === 'culture_moment'), 'gongfu-tea was used');
    assert.ok(!stories.some((s) => s.place_id === PLACE.placeId), 'the place was used');
    assert.ok(!recent.has('contains:pork'), 'diet markers are not dedupe keys');
  });

  it('writes one story per place per night', () => {
    const same = { ...LOVED, placeId: PLACE.placeId };
    const i = input({ loved: [same] });
    const picked = pick(i, candidates(i));
    assert.equal(picked.filter((c) => c.placeId === PLACE.placeId).length, 1);
  });
});

describe('cost limit', () => {
  it('stops when the run reaches its limit', async () => {
    const budget = { maxCalls: 3, used: 0 };
    const result = await generateStories(input({ budget }));
    assert.equal(result.stopped, 'cost_limit');
    assert.equal(result.stories.length, 3);
    assert.equal(budget.used, 3);
  });
});

describe('images', () => {
  it('uses only real AMap photos on place stories', async () => {
    const illustrated: string[] = [];
    const illustrate = { generate: async (_: string, key: string) => (illustrated.push(key), 'https://example.test/story-images/x.png') };
    const { stories } = await generateStories(input({ illustrate }));
    const place = stories.find((s) => s.type === 'place_spotlight')!;
    assert.deepEqual(place.slides.map((s) => s.image_kind), ['real_photo', 'real_photo', 'none']);
    assert.equal(place.slides[0].image_url, PLACE.photos[0]);
    for (const s of stories.filter((x) => x.type !== 'culture_moment' && x.type !== 'learn_how')) assert.ok(s.slides.every((sl) => sl.image_kind !== 'ai_illustration'), s.type);
    const culture = stories.find((s) => s.type === 'culture_moment')!;
    assert.equal(culture.slides[0].image_kind, 'ai_illustration');
    assert.deepEqual(illustrated.sort(), ['Beijing-craft:paper-cutting', 'Beijing-gongfu-tea']);
  });

  it('works without an illustrator: colour and icon', async () => {
    const { stories } = await generateStories(input());
    assert.ok(stories.find((s) => s.type === 'culture_moment')!.slides.every((s) => s.image_url === null));
  });
});

describe('grounded fields', () => {
  it('takes diet markers, places and actions from facts, not the model', async () => {
    const { stories } = await generateStories(input());
    const food = stories.find((s) => s.type === 'food_to_try')!;
    assert.ok(food.topics.includes('contains:pork'));
    assert.equal(food.action.kind, 'find_food');
    const loved = stories.find((s) => s.type === 'your_people_loved')!;
    assert.equal(loved.nationality, 'TZ');
    assert.ok(loved.topics.includes('diet:halal'));
    assert.equal(loved.action.payload.amap_poi_id, 'B000TEST02');
  });

  it('never uses nationality groups under 5 people', async () => {
    const { stories } = await generateStories(input({ loved: [{ ...LOVED, visitors: 4, likes: 4 }] }));
    assert.ok(!stories.some((s) => s.type === 'your_people_loved'));
  });

  it('only writes about enabled topics', async () => {
    const topics = TOPICS.map((t) => (t.id === 'roujiamo' ? { ...t, enabled: false } : t));
    const { stories } = await generateStories(input({ topics }));
    assert.ok(!stories.some((s) => s.type === 'food_to_try'));
  });
});

// Shaped like what the Edge Function builds from the Wikipedia API (wikipedia.ts).
const WIKI: WikiFact = {
  topicId: 'wiki:lion-dance',
  title: '[PLACEHOLDER] Lion dance',
  url: 'https://en.wikipedia.org/wiki/Lion_dance',
  extract: '[PLACEHOLDER] Lion dance is a traditional dance. '.repeat(10),
  image: { url: 'https://example.test/story-images/wikimedia/lion.jpg', credit: '[PLACEHOLDER] Author · CC BY-SA 4.0 · Wikimedia Commons' },
};
const WIKI_TOPIC: TopicRow = { id: 'wiki:lion-dance', category: 'culture', label: 'Lion dance', enabled: true, wikipedia: 'Lion dance' };

describe('wikipedia stories', () => {
  const only = (extra: Partial<GenerationInput> = {}) =>
    input({ topics: [...TOPICS, WIKI_TOPIC], wikipedia: [WIKI], perType: { culture_moment: 1, ...zero(['culture_moment']) }, ...extra });

  it('writes culture stories from the article, credited, with its free photo', async () => {
    const model = mockModel((p) => VALID(slidesAsked(p)));
    const { stories } = await generateStories(only({ model }));
    const [story] = stories;
    assert.equal(story.topics[0], 'wiki:lion-dance');
    assert.match(story.attribution ?? '', /Wikipedia.*CC BY-SA/);
    assert.equal(story.slides[0].image_kind, 'real_photo');
    assert.match(story.slides[0].image_credit ?? '', /Wikimedia Commons/);
    assert.equal(story.sources[0].kind, 'wikipedia');
    assert.match(model.prompts[0], /From the Wikipedia article/);
  });

  it('draws an illustration only when the article has no free photo', async () => {
    const illustrated: string[] = [];
    const illustrate = { generate: async (_: string, key: string) => (illustrated.push(key), 'https://example.test/story-images/x.png') };
    await generateStories(only({ illustrate }));
    await generateStories(only({ illustrate, wikipedia: [{ ...WIKI, image: undefined }], recentKeys: new Set() }));
    assert.deepEqual(illustrated, ['Beijing-wiki:[PLACEHOLDER] Lion dance']);
  });

  it('picks articles to fetch: enabled, with a title, not used recently', () => {
    const topics = [WIKI_TOPIC, { ...WIKI_TOPIC, id: 'wiki:off', enabled: false }, { ...WIKI_TOPIC, id: 'wiki:none', wikipedia: null }, { ...WIKI_TOPIC, id: 'wiki:recent', wikipedia: 'Go (game)' }];
    const picked = wikipediaTopics({ topics, recentKeys: new Set(['wiki:recent']), city: 'Beijing', now: new Date() });
    assert.deepEqual(picked, [{ topicId: 'wiki:lion-dance', title: 'Lion dance' }]);
  });

  it('skips articles too short to write from', async () => {
    const { stories } = await generateStories(only({ wikipedia: [{ ...WIKI, extract: 'Short.' }], topics: [...TOPICS.filter((t) => t.category !== 'culture'), WIKI_TOPIC] }));
    assert.equal(stories.length, 0);
  });
});

describe('learn how', () => {
  it('teaches a craft from its curated steps and opens the guide to learn it', async () => {
    const model = mockModel((p) => VALID(slidesAsked(p)));
    const { stories } = await generateStories(input({ model, perType: { learn_how: 1, ...zero(['learn_how']) } }));
    const [story] = stories;
    assert.equal(story.type, 'learn_how');
    assert.equal(story.slides.length, 4);
    assert.equal(story.action.kind, 'learn_with_hao');
    assert.equal(story.status, 'draft');
    assert.match(model.prompts[0], /Step 1: \[PLACEHOLDER\] fold[\s\S]*Step 4: \[PLACEHOLDER\] unfold/);
  });
});

/** perType with every other type set to 0. */
function zero(keep: StoryType[]): Partial<Record<StoryType, number>> {
  const all: StoryType[] = ['culture_moment', 'place_spotlight', 'your_people_loved', 'food_to_try', 'phrase_of_the_day', 'etiquette_tip', 'coming_up', 'season_tip', 'learn_how'];
  return Object.fromEntries(all.filter((t) => !keep.includes(t)).map((t) => [t, 0]));
}
