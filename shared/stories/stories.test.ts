/// <reference types="node" />
// Unit tests for Discover stories: schema validation, diet markers and feed ranking.
// Run: npm run test:stories  (node --test, no extra packages; no network)
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MAX_PER_TYPE, MIN_TYPES_PER_FEED, SKIP_LIMIT } from './config.ts';
import { dietConflict, dietTags } from './diet.ts';
import { arrangeByType, emptyHistory, exclusionOf, rankFeed, type FeedProfile, type FeedStory } from './ranking.ts';
import { parseGenerated, storySchema, wordCount, type StoryType } from './schema.ts';

// ─── Schema ──────────────────────────────────────────────────────────────────
const slide = (over: Record<string, unknown> = {}) => ({ heading: '[PLACEHOLDER] heading', body: '[PLACEHOLDER] body text.', image_url: null, image_kind: 'none', ...over });
const story = (over: Record<string, unknown> = {}) => ({
  id: 's1',
  type: 'culture_moment',
  city: null,
  nationality: null,
  audience: 'all',
  language: 'en',
  title: '[PLACEHOLDER]',
  slides: [slide(), slide(), slide()],
  action: { kind: 'ask_more', label: 'Ask Hao more', payload: {} },
  place_id: null,
  topics: ['gongfu-tea'],
  valid_until: null,
  ...over,
});

describe('story schema', () => {
  it('accepts a valid story', () => {
    assert.equal(storySchema.safeParse(story()).success, true);
  });

  it('needs 3 or 4 slides', () => {
    assert.equal(storySchema.safeParse(story({ slides: [slide(), slide()] })).success, false);
    assert.equal(storySchema.safeParse(story({ slides: [slide(), slide(), slide(), slide(), slide()] })).success, false);
  });

  it('limits headings to 8 words and bodies to 40', () => {
    assert.equal(storySchema.safeParse(story({ slides: [slide({ heading: 'one two three four five six seven eight nine' }), slide(), slide()] })).success, false);
    assert.equal(storySchema.safeParse(story({ slides: [slide({ body: Array(41).fill('word').join(' ') }), slide(), slide()] })).success, false);
    assert.equal(storySchema.safeParse(story({ slides: [slide({ body: Array(40).fill('word').join(' ') }), slide(), slide()] })).success, true);
  });

  it('counts Chinese characters towards the word limit', () => {
    assert.equal(wordCount('Say 你好 (nǐ hǎo)'), 4);
    assert.ok(wordCount('你'.repeat(100)) > 40);
  });

  it('only allows https image URLs', () => {
    assert.equal(storySchema.safeParse(story({ slides: [slide({ image_url: 'http://example.test/a.jpg', image_kind: 'real_photo' }), slide(), slide()] })).success, false);
    assert.equal(storySchema.safeParse(story({ slides: [slide({ image_url: 'https://example.test/a.jpg', image_kind: 'real_photo', image_credit: '[PLACEHOLDER]' }), slide(), slide()] })).success, true);
  });

  it('never allows AI images on place stories', () => {
    const ai = slide({ image_url: 'https://example.test/a.png', image_kind: 'ai_illustration' });
    assert.equal(storySchema.safeParse(story({ type: 'place_spotlight', slides: [ai, slide(), slide()] })).success, false);
    assert.equal(storySchema.safeParse(story({ type: 'culture_moment', slides: [ai, slide(), slide()] })).success, true);
  });

  it('needs a credit on photos that are not from AMap', () => {
    const photo = { image_url: 'https://example.test/a.jpg', image_kind: 'real_photo' };
    assert.equal(storySchema.safeParse(story({ slides: [slide(photo), slide(), slide()] })).success, false);
    assert.equal(storySchema.safeParse(story({ slides: [slide({ ...photo, image_credit: '[PLACEHOLDER] · CC BY 2.0' }), slide(), slide()] })).success, true);
    assert.equal(storySchema.safeParse(story({ type: 'place_spotlight', slides: [slide(photo), slide(), slide()] })).success, true);
  });

  it('accepts learn_how stories and their action', () => {
    assert.equal(storySchema.safeParse(story({ type: 'learn_how', action: { kind: 'learn_with_hao', label: 'Learn with Hao', payload: { craft: 'paper-cutting' } } })).success, true);
  });

  it('rejects unknown types and action kinds', () => {
    assert.equal(storySchema.safeParse(story({ type: 'video' })).success, false);
    assert.equal(storySchema.safeParse(story({ action: { kind: 'buy', label: 'Buy', payload: {} } })).success, false);
  });
});

describe('model output', () => {
  const good = { title: '[PLACEHOLDER]', slides: [{ heading: 'A', body: 'B' }, { heading: 'C', body: 'D' }, { heading: 'E', body: 'F' }], action_label: 'Ask Hao more' };

  it('parses JSON, also inside a code fence', () => {
    assert.equal(parseGenerated(JSON.stringify(good)).ok, true);
    assert.equal(parseGenerated('```json\n' + JSON.stringify(good) + '\n```').ok, true);
  });

  it('reports invalid output with a readable reason', () => {
    const bad = parseGenerated('not json');
    assert.equal(bad.ok, false);
    const short = parseGenerated(JSON.stringify({ ...good, slides: good.slides.slice(0, 2) }));
    assert.equal(short.ok, false);
    if (!short.ok) assert.match(short.error, /slides/);
  });
});

// ─── Diet markers ────────────────────────────────────────────────────────────
describe('diet markers', () => {
  it('tags pork, beef and allergens from dish facts', () => {
    assert.ok(dietTags('叉烧包 char siu pork bun').includes('contains:pork'));
    assert.ok(dietTags('Lanzhou beef noodles 兰州牛肉面').includes('diet:halal'));
    assert.ok(!dietTags('兰州牛肉面').includes('contains:pork'));
    assert.ok(dietTags('Kung pao chicken with peanuts 花生').includes('allergen:peanut'));
  });

  it('hides pork stories from halal users but keeps halal ones', () => {
    assert.equal(dietConflict(['contains:pork', 'contains:meat'], ['halal'], []), 'halal');
    assert.equal(dietConflict(['diet:halal', 'contains:beef', 'contains:meat'], ['halal'], []), null);
    assert.equal(dietConflict(['contains:meat'], ['vegetarian'], []), 'vegetarian');
    assert.equal(dietConflict(['allergen:peanut'], [], ['Peanuts']), 'allergy:Peanuts');
    assert.equal(dietConflict(['allergen:peanut'], [], []), null);
  });
});

// ─── Feed ranking ────────────────────────────────────────────────────────────
const NOW = new Date('2026-10-24T08:00:00Z');
let n = 0;
const s = (type: StoryType, over: Partial<FeedStory> = {}): FeedStory => ({
  id: `story-${String(++n).padStart(3, '0')}`,
  type,
  city: 'Beijing',
  nationality: null,
  audience: 'all',
  language: 'en',
  topics: [],
  place_id: null,
  created_at: '2026-10-23T18:00:00Z',
  ...over,
});
const profile = (over: Partial<FeedProfile> = {}): FeedProfile => ({
  city: 'Beijing',
  nationality: 'TZ',
  audience: 'student',
  language: 'en',
  diet: [],
  allergies: [],
  ...over,
});
const rank = (stories: FeedStory[], over: Partial<FeedProfile> = {}, history = emptyHistory()) =>
  rankFeed(stories, { profile: profile(over), history, now: NOW, seed: 'user-1:2026-10-24' });

/** A pool with several of every type for Beijing. */
function pool() {
  const types: StoryType[] = ['culture_moment', 'place_spotlight', 'food_to_try', 'phrase_of_the_day', 'etiquette_tip', 'coming_up', 'season_tip'];
  return types.flatMap((t) => [s(t), s(t), s(t), s(t)]);
}

describe('feed filters', () => {
  it('shows only the user\'s city and all-city stories', () => {
    const shanghai = s('culture_moment', { city: 'Shanghai' });
    const everywhere = s('culture_moment', { city: null });
    assert.equal(exclusionOf(shanghai, profile(), emptyHistory(), 'en'), 'city');
    assert.equal(exclusionOf(everywhere, profile(), emptyHistory(), 'en'), null);
    assert.ok(!rank([shanghai, ...pool()]).some((x) => x.id === shanghai.id));
  });

  it('matches the audience; "all" fits everyone', () => {
    const tourist = s('etiquette_tip', { audience: 'tourist' });
    const student = s('etiquette_tip', { audience: 'student' });
    assert.equal(exclusionOf(tourist, profile(), emptyHistory(), 'en'), 'audience');
    assert.equal(exclusionOf(student, profile(), emptyHistory(), 'en'), null);
    assert.equal(exclusionOf(tourist, profile({ audience: null }), emptyHistory(), 'en'), null);
  });

  it('uses the user\'s language when stories exist in it, otherwise English', () => {
    const fr = s('culture_moment', { language: 'fr' });
    const en = s('culture_moment');
    assert.deepEqual(rank([fr, en], { language: 'fr' }).map((x) => x.id), [fr.id]);
    assert.deepEqual(rank([en], { language: 'sw' }).map((x) => x.id), [en.id]);
  });

  it('respects diet and allergies', () => {
    const pork = s('food_to_try', { topics: ['roujiamo', 'contains:pork', 'contains:meat'] });
    const halal = s('food_to_try', { topics: ['lamian', 'diet:halal', 'contains:beef', 'contains:meat'] });
    const peanuts = s('food_to_try', { topics: ['kung-pao', 'allergen:peanut'] });
    const ids = rank([pork, halal, peanuts], { diet: ['halal'], allergies: ['peanuts'] }).map((x) => x.id);
    assert.deepEqual(ids, [halal.id]);
  });

  it('keeps nationality stories for that nationality only', () => {
    const ru = s('your_people_loved', { nationality: 'RU' });
    assert.equal(exclusionOf(ru, profile(), emptyHistory(), 'en'), 'nationality');
    assert.equal(exclusionOf(ru, profile({ nationality: 'RU' }), emptyHistory(), 'en'), null);
  });
});

describe('feed exclusions', () => {
  it('drops completed, hidden, muted and twice-skipped stories', () => {
    const [done, hidden, skippedOnce, skippedTwice, muted, kept] = [
      s('culture_moment'),
      s('culture_moment'),
      s('food_to_try'),
      s('culture_moment'),
      s('culture_moment', { topics: ['mahjong'] }),
      s('etiquette_tip'),
    ];
    const history = emptyHistory();
    history.completed.add(done.id);
    history.hidden.add(hidden.id);
    history.skips.set(skippedOnce.id, SKIP_LIMIT - 1);
    history.skips.set(skippedTwice.id, SKIP_LIMIT);
    history.mutedTopics.add('mahjong');
    const ids = rank([done, hidden, skippedOnce, skippedTwice, muted, kept], {}, history).map((x) => x.id).sort();
    assert.deepEqual(ids, [skippedOnce.id, kept.id].sort());
  });

  it('muting a diet marker is not possible: only subject topics mute', () => {
    const history = emptyHistory();
    history.mutedTopics.add('contains:pork');
    assert.equal(exclusionOf(s('food_to_try', { topics: ['contains:pork'] }), profile(), history, 'en'), null);
  });

  it('shows a place once per set', () => {
    const a = s('place_spotlight', { place_id: 'p1' });
    const b = s('your_people_loved', { place_id: 'p1', nationality: 'TZ' });
    assert.equal(rank([a, b]).length, 1);
  });
});

describe('feed mix', () => {
  it('returns up to the feed size with at least 4 types', () => {
    const feed = rank(pool());
    assert.ok(feed.length >= 15 && feed.length <= 20, `got ${feed.length}`);
    assert.ok(new Set(feed.map((x) => x.type)).size >= MIN_TYPES_PER_FEED);
  });

  it('never puts two stories of the same type next to each other', () => {
    for (const feed of [rank(pool()), rank(pool(), { nationality: 'RU' })]) {
      for (let i = 1; i < feed.length; i++) assert.notEqual(feed[i].type, feed[i - 1].type, `positions ${i - 1} and ${i}`);
    }
  });

  it('caps each type', () => {
    const many = [...Array(12)].map(() => s('culture_moment')).concat(pool());
    const counts = new Map<string, number>();
    for (const x of rank(many)) counts.set(x.type, (counts.get(x.type) ?? 0) + 1);
    assert.ok(Math.max(...counts.values()) <= MAX_PER_TYPE);
  });

  it('boosts your_people_loved for the user\'s nationality', () => {
    const loved = s('your_people_loved', { nationality: 'TZ', place_id: 'p9' });
    assert.equal(rank([loved, ...pool()])[0].id, loved.id);
  });

  it('boosts "your country and China" for people from there, and shows it to nobody else', () => {
    const home = s('home_and_china', { nationality: 'TZ' });
    assert.equal(rank([home, ...pool()])[0].id, home.id);
    assert.equal(exclusionOf(home, profile({ nationality: 'KE' }), emptyHistory(), 'en'), 'nationality');
  });

  it('includes a lone type even when it scores low', () => {
    const season = s('season_tip');
    const others = (['culture_moment', 'food_to_try', 'place_spotlight'] as StoryType[]).flatMap((t) => [...Array(6)].map(() => s(t)));
    assert.ok(rank([season, ...others]).some((x) => x.id === season.id));
  });

  it('is the same all day for one user', () => {
    const stories = pool();
    assert.deepEqual(rank(stories).map((x) => x.id), rank([...stories].reverse()).map((x) => x.id));
  });

  it('drops what cannot be separated instead of placing it side by side', () => {
    const order = arrangeByType([s('culture_moment'), s('culture_moment'), s('culture_moment'), s('food_to_try')]);
    assert.deepEqual(order.map((x) => x.type), ['culture_moment', 'food_to_try', 'culture_moment']);
  });
});
