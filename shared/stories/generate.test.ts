/// <reference types="node" />
// Story generation with a mocked model and mocked AMap data: no network, no API keys.
// Run: npm run test:stories
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { FactBundle, LovedFact, PlaceFact, TopicRow, WikiFact } from './facts.ts';
import { generateStories, pick, candidates, homeTopics, paintingTopics, recentKeysFrom, wikipediaTopics, type GenerationInput, type StoryModel } from './generate.ts';
import { STORY_TYPES, type StoryType } from './schema.ts';

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

const QUIZ = { question: '[PLACEHOLDER] Which is right?', choices: ['[PLACEHOLDER] right', '[PLACEHOLDER] wrong one', '[PLACEHOLDER] wrong two'], answer: 0, why: '[PLACEHOLDER] because.' };

const VALID = (slides = 3, quiz = false) =>
  JSON.stringify({
    title: '[PLACEHOLDER] title',
    slides: Array.from({ length: slides }, (_, i) => ({ heading: `[PLACEHOLDER] ${i + 1}`, body: '[PLACEHOLDER] A short body.' })),
    action_label: 'Ask Hao more',
    ...(quiz ? { quiz: QUIZ } : {}),
  });

/** A model that answers from a script of outputs, recording every prompt it got. */
function mockModel(reply: (prompt: string, call: number, quiz: boolean) => string): StoryModel & { prompts: string[] } {
  const prompts: string[] = [];
  return {
    name: 'mock-model',
    prompts,
    generate: async ({ prompt, quiz }) => {
      prompts.push(prompt);
      return reply(prompt, prompts.length, quiz);
    },
  };
}
const slidesAsked = (prompt: string) => Number(/SLIDES: exactly (\d)/.exec(prompt)?.[1] ?? 3);
/** Answers every prompt validly, with a quiz when one is asked for. */
const goodModel = () => mockModel((p, _, quiz) => VALID(slidesAsked(p), quiz));

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
    model: goodModel(),
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
    const model = goodModel();
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
    const model = mockModel((p, n, quiz) => (n === 1 ? '{"title": "x"}' : VALID(slidesAsked(p), quiz)));
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
    const model = goodModel();
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
    const model = goodModel();
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
  return Object.fromEntries(STORY_TYPES.filter((t) => !keep.includes(t)).map((t) => [t, 0]));
}

describe('quizzes', () => {
  it('opens a "Did you know?" with a quiz, its choices shuffled and the answer still right', async () => {
    const { stories, errors } = await generateStories(input({ perType: { did_you_know: 1, ...zero(['did_you_know']) } }));
    assert.deepEqual(errors, []);
    const [story] = stories;
    assert.equal(story.type, 'did_you_know');
    assert.equal(story.interaction?.quiz_at, 'start');
    const quiz = story.interaction!.quiz!;
    assert.equal(quiz.choices[quiz.answer], QUIZ.choices[QUIZ.answer]);
    assert.deepEqual([...quiz.choices].sort(), [...QUIZ.choices].sort());
  });

  it('ends culture stories with a quiz', async () => {
    const { stories } = await generateStories(input({ perType: { culture_moment: 1, ...zero(['culture_moment']) } }));
    assert.equal(stories[0].interaction?.quiz_at, 'end');
  });

  it('asks again when a quiz type comes back without one, and drops a quiz nobody asked for', async () => {
    const model = mockModel((p, n) => VALID(slidesAsked(p), n > 1));
    const { stories, errors } = await generateStories(input({ model, perType: { culture_moment: 1, ...zero(['culture_moment']) } }));
    assert.deepEqual(errors, []);
    assert.match(model.prompts[1], /rejected: quiz: missing/);
    assert.ok(stories[0].interaction?.quiz);
    const plain = await generateStories(input({ model: mockModel((p) => VALID(slidesAsked(p), true)), perType: { etiquette_tip: 1, ...zero(['etiquette_tip']) } }));
    assert.equal(plain.stories[0].interaction, null);
  });

  it('rejects a quiz whose answer is not one of the choices', async () => {
    const bad = (p: string) => JSON.stringify({ ...JSON.parse(VALID(slidesAsked(p))), quiz: { ...QUIZ, answer: 5 } });
    const { stories, errors } = await generateStories(input({ model: mockModel(bad), perType: { did_you_know: 1, ...zero(['did_you_know']) } }));
    assert.equal(stories.length, 0);
    assert.match(errors[0].error, /answer must be the index/);
  });

  it('asks "Tried it / Want to try" on food and crafts, in plain English for the Hao DNA', async () => {
    const { stories } = await generateStories(input());
    assert.equal(stories.find((s) => s.type === 'food_to_try')?.interaction?.tried, 'Roujiamo');
    assert.equal(stories.find((s) => s.type === 'learn_how')?.interaction?.tried, '[PLACEHOLDER] Paper cutting');
  });

  it('never writes the same topic twice in a night, even as two types', async () => {
    const { stories } = await generateStories(input({ perType: { culture_moment: 1, did_you_know: 1, ...zero(['culture_moment', 'did_you_know']) } }));
    assert.equal(stories.filter((s) => s.topics.includes('gongfu-tea')).length, 1);
  });
});

const PAINTING: WikiFact = {
  topicId: 'painting:early-spring',
  title: '[PLACEHOLDER] Early Spring (painting)',
  url: 'https://en.wikipedia.org/wiki/Early_Spring_(painting)',
  extract: '[PLACEHOLDER] Early Spring is a hanging scroll by Guo Xi. '.repeat(8),
  image: { url: 'https://example.test/story-images/wikimedia/early-spring.jpg', credit: '[PLACEHOLDER] Guo Xi · Public domain · Wikimedia Commons' },
};
const PAINTING_TOPIC: TopicRow = { id: 'painting:early-spring', category: 'painting', label: 'Early Spring', enabled: true, wikipedia: 'Early Spring (painting)', image_file: 'Guo Xi - Early Spring (large).jpg' };

describe('paintings', () => {
  const only = (extra: Partial<GenerationInput> = {}) =>
    input({ topics: [...TOPICS, PAINTING_TOPIC], paintings: [PAINTING], perType: { painting: 1, ...zero(['painting']) }, ...extra });

  it('shows the real painting on every slide, credited, and never draws one', async () => {
    const illustrated: string[] = [];
    const illustrate = { generate: async (_: string, key: string) => (illustrated.push(key), 'https://example.test/x.png') };
    const { stories, errors } = await generateStories(only({ illustrate }));
    assert.deepEqual(errors, []);
    const [story] = stories;
    assert.ok(story.slides.every((s) => s.image_url === PAINTING.image!.url && s.image_kind === 'real_photo' && s.image_credit));
    assert.equal(story.interaction?.quiz_at, 'end');
    assert.deepEqual(illustrated, []);
  });

  it('skips a painting without its picture', async () => {
    const { stories } = await generateStories(only({ paintings: [{ ...PAINTING, image: undefined }] }));
    assert.equal(stories.length, 0);
  });

  it('fetches only paintings that name their Commons file', () => {
    const topics = [PAINTING_TOPIC, { ...PAINTING_TOPIC, id: 'painting:no-file', image_file: null }, WIKI_TOPIC];
    const picked = paintingTopics({ topics, recentKeys: new Set(), city: 'Beijing', now: new Date(), limit: 5 });
    assert.deepEqual(picked, [{ topicId: 'painting:early-spring', title: 'Early Spring (painting)', imageFile: 'Guo Xi - Early Spring (large).jpg' }]);
    assert.ok(!wikipediaTopics({ topics, recentKeys: new Set(), city: 'Beijing', now: new Date() }).some((t) => t.topicId.startsWith('painting:')));
  });
});

const HOME: WikiFact = {
  topicId: 'home:tz-tazara',
  title: '[PLACEHOLDER] TAZARA Railway',
  url: 'https://en.wikipedia.org/wiki/TAZARA_Railway',
  extract: '[PLACEHOLDER] The TAZARA Railway links Tanzania and Zambia and was built with China. '.repeat(5),
};
const HOME_TOPICS: TopicRow[] = [
  { id: 'home:tz-tazara', category: 'home', label: 'TAZARA', enabled: true, wikipedia: 'TAZARA Railway', nationality: 'TZ' },
  { id: 'home:ke', category: 'home', label: 'Kenya and China', enabled: true, wikipedia: 'China–Kenya relations', nationality: 'KE' },
  { id: 'home:fr', category: 'home', label: 'France and China', enabled: true, wikipedia: 'China–France relations', nationality: 'FR' },
];

describe('your country and China', () => {
  it('writes for the topic\'s nationality only, naming the country in the facts', async () => {
    const model = goodModel();
    const { stories } = await generateStories(input({ model, topics: [...TOPICS, ...HOME_TOPICS], home: [HOME], perType: { home_and_china: 1, ...zero(['home_and_china']) } }));
    const [story] = stories;
    assert.equal(story.type, 'home_and_china');
    assert.equal(story.nationality, 'TZ');
    assert.match(model.prompts[0], /The reader is from: Tanzania/);
  });

  it('fetches one article per nationality with users, most users first', () => {
    const picked = homeTopics({ topics: HOME_TOPICS, recentKeys: new Set(), city: 'Beijing', now: new Date(), nationalities: ['KE', 'TZ', 'NG'] });
    assert.deepEqual(picked.map((p) => p.nationality), ['KE', 'TZ']);
  });
});
