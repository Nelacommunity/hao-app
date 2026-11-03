/// <reference types="node" />
// Unit tests for community ranking. Run: npm run test:ranking  (node --test, no extra packages)
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MIN_GROUP_SIZE } from './config.ts';
import { conflictOf, likeRatio, rankPlaces, type RankPlace, type RankProfile, type SocialProof } from './ranking.ts';

// ─── A mocked AMap /v5/place/around response (fields as AMap sends them) ─────
const amapAround = {
  status: '1',
  pois: [
    { id: 'B000000001', name: '[PLACE NAME] 清真牛肉面', type: '餐饮服务;中餐厅;清真菜馆', typecode: '050121', distance: '250', business: { rating: '4.1', cost: '28', tag: '牛肉面,拉条子' } },
    { id: 'B000000002', name: '[PLACE NAME] 烤肉', type: '餐饮服务;中餐厅;烧烤', typecode: '050100', distance: '300', business: { rating: '4.7', cost: '90', tag: '烤五花肉,猪颈肉' } },
    { id: 'B000000003', name: '[PLACE NAME] 海鲜大排档', type: '餐饮服务;中餐厅;海鲜酒楼', typecode: '050119', distance: '400', business: { rating: '4.6', cost: '120', tag: '小龙虾' } },
    { id: 'B000000004', name: '[PLACE NAME] 饺子馆', type: '餐饮服务;中餐厅;中餐厅', typecode: '050100', distance: '350', business: { rating: '4.0', cost: '35', tag: '' } },
    { id: 'B000000005', name: '[PLACE NAME] 俄式西餐', type: '餐饮服务;外国餐厅;俄国菜', typecode: '050200', distance: '320', business: { rating: '4.2', cost: '110', tag: '罗宋汤' } },
  ],
};

/** The same mapping the API server does from AMap POIs (src/lib/server/amap.ts), reduced to what ranking reads. */
function fromAmap(poi: (typeof amapAround.pois)[number]): RankPlace {
  return {
    id: poi.id,
    name: poi.name,
    nameZh: poi.name,
    kind: poi.typecode.startsWith('05') ? 'food' : 'attraction',
    typeZh: poi.type.split(';').pop() ?? '',
    tags: poi.business.tag.split(',').filter(Boolean),
    cost: Number(poi.business.cost) || undefined,
    rating: Number(poi.business.rating) || undefined,
    distanceM: Number(poi.distance),
  };
}

const candidates = amapAround.pois.map(fromAmap);

const profile = (over: Partial<RankProfile> = {}): RankProfile => ({
  nationality: null,
  region: null,
  city: 'Beijing',
  diet: [],
  allergies: [],
  spice: 'medium',
  budget: 'medium',
  ...over,
});

const noVisits = new Map<string, number | null>();
const stat = (visitors: number, likes: number, dislikes = 0) => ({ visitors, likes, dislikes });

describe('nationality boost', () => {
  it('ranks a place people from your country liked above a better-rated one', () => {
    const proof = new Map<string, SocialProof>([['B000000004', { country: stat(25, 23) }]]);
    const ranked = rankPlaces(candidates, { profile: profile({ nationality: 'TZ', region: 'east_africa' }), proof, myRatings: noVisits });
    assert.equal(ranked[0].place.id, 'B000000004');
    assert.deepEqual(ranked[0].reason, { kind: 'country', count: 23, nationality: 'TZ' });
  });
});

describe('region fallback', () => {
  it('uses the region when the country group has no data', () => {
    const proof = new Map<string, SocialProof>([['B000000004', { region: { ...stat(12, 11), region: 'east_africa' } }]]);
    const ranked = rankPlaces(candidates, { profile: profile({ nationality: 'KE', region: 'east_africa' }), proof, myRatings: noVisits });
    assert.equal(ranked[0].place.id, 'B000000004');
    assert.deepEqual(ranked[0].reason, { kind: 'region', count: 11, region: 'east_africa', city: 'Beijing' });
  });

  it('prefers the country reason when both are strong', () => {
    const proof = new Map<string, SocialProof>([['B000000004', { country: stat(8, 8), region: { ...stat(30, 27), region: 'east_africa' } }]]);
    const [top] = rankPlaces(candidates, { profile: profile({ nationality: 'TZ', region: 'east_africa' }), proof, myRatings: noVisits });
    assert.equal(top.reason.kind, 'country');
  });
});

describe('MIN_GROUP_SIZE', () => {
  it('ignores groups smaller than the minimum', () => {
    const tooFew = stat(MIN_GROUP_SIZE - 1, MIN_GROUP_SIZE - 1);
    assert.equal(likeRatio(tooFew), null);
    assert.equal(likeRatio(stat(MIN_GROUP_SIZE, MIN_GROUP_SIZE)), 1);

    const proof = new Map<string, SocialProof>([['B000000004', { country: tooFew, region: { ...tooFew, region: 'east_africa' } }]]);
    const ranked = rankPlaces(candidates, { profile: profile({ nationality: 'TZ', region: 'east_africa' }), proof, myRatings: noVisits });
    const dumplings = ranked.find((r) => r.place.id === 'B000000004')!;
    assert.notEqual(dumplings.reason.kind, 'country');
    assert.notEqual(dumplings.reason.kind, 'region');
    // Without usable stats it scores exactly like a place with no stats at all.
    const baseline = rankPlaces(candidates, { profile: profile({ nationality: 'TZ', region: 'east_africa' }), proof: new Map(), myRatings: noVisits });
    assert.equal(dumplings.score, baseline.find((r) => r.place.id === 'B000000004')!.score);
  });
});

describe('diet and allergy exclusion', () => {
  it('drops seafood houses for a shellfish allergy', () => {
    const ranked = rankPlaces(candidates, { profile: profile({ allergies: ['shellfish'] }), proof: new Map(), myRatings: noVisits });
    assert.ok(!ranked.some((r) => r.place.id === 'B000000003'));
    assert.equal(conflictOf(candidates[2], { diet: [], allergies: ['shellfish'] }), 'allergy:shellfish');
  });

  it('drops pork barbecue for halal and recommends the halal place with a reason', () => {
    const ranked = rankPlaces(candidates, { profile: profile({ diet: ['halal'], budget: 'low' }), proof: new Map(), myRatings: noVisits });
    assert.ok(!ranked.some((r) => r.place.id === 'B000000002'));
    assert.equal(ranked[0].place.id, 'B000000001');
    assert.deepEqual(ranked[0].reason, { kind: 'profile', matches: ['halal', 'budget'] });
  });

  it('drops barbecue and seafood for vegetarians', () => {
    const ranked = rankPlaces(candidates, { profile: profile({ diet: ['vegetarian'] }), proof: new Map(), myRatings: noVisits });
    const ids = ranked.map((r) => r.place.id);
    assert.ok(!ids.includes('B000000002') && !ids.includes('B000000003'));
  });

  it('never excludes sights, only food', () => {
    const temple: RankPlace = { id: 'B000000099', name: '[PLACE NAME]', nameZh: '[PLACE NAME] 烤鸭街', kind: 'attraction', typeZh: '寺庙', tags: [] };
    assert.equal(conflictOf(temple, { diet: ['vegetarian', 'halal'], allergies: ['shellfish'] }), null);
  });
});

describe('own visits', () => {
  it('pushes places the user disliked to the bottom', () => {
    const myRatings = new Map<string, number | null>([['B000000002', -1]]);
    const ranked = rankPlaces(candidates, { profile: profile(), proof: new Map(), myRatings });
    assert.equal(ranked.at(-1)!.place.id, 'B000000002');
  });
});

describe('demo: two users ask "food near me" from the same spot', () => {
  // Seeded community stats for the same five places (see supabase/seed.sql).
  const proofFor = (nationality: string) =>
    new Map<string, SocialProof>(
      nationality === 'TZ'
        ? [
            ['B000000001', { country: stat(23, 21), region: { ...stat(40, 35), region: 'east_africa' } }],
            ['B000000005', { region: { ...stat(6, 2), region: 'east_africa' } }],
          ]
        : [
            ['B000000005', { country: stat(18, 16), region: { ...stat(30, 26), region: 'eastern_europe' } }],
            ['B000000001', { region: { ...stat(7, 3), region: 'eastern_europe' } }],
          ]
    );

  const tz = rankPlaces(candidates, { profile: profile({ nationality: 'TZ', region: 'east_africa' }), proof: proofFor('TZ'), myRatings: noVisits });
  const ru = rankPlaces(candidates, { profile: profile({ nationality: 'RU', region: 'eastern_europe' }), proof: proofFor('RU'), myRatings: noVisits });

  it('gives them different top results', () => {
    assert.equal(tz[0].place.id, 'B000000001');
    assert.equal(ru[0].place.id, 'B000000005');
  });

  it('gives them different reason lines', () => {
    assert.deepEqual(tz[0].reason, { kind: 'country', count: 21, nationality: 'TZ' });
    assert.deepEqual(ru[0].reason, { kind: 'country', count: 16, nationality: 'RU' });
  });
});
