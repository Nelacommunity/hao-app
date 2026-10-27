/// <reference types="node" />
// Unit tests for the digital twin ("Hao DNA"): validating what the model proposes, and the plain text.
// Run: npm run test:twin  (node --test, no network)
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DefaultPreferences } from './preferences.ts';
import { applyTwinUpdates, dnaChanges, emptyTwinUpdates, MAX_LOVES, twinDna, twinFromRow, twinMissing } from './twin.ts';
import type { TwinProfile } from './types';

const profile = (over: Partial<TwinProfile> = {}): TwinProfile => ({
  nationality: null,
  home_city: null,
  city: null,
  traveller_type: null,
  preferences: { ...DefaultPreferences, diet: [], allergies: [] },
  loves: [],
  wants: [],
  experiences: [],
  ...over,
});

describe('applyTwinUpdates', () => {
  it('saves valid answers and says what changed', () => {
    const { profile: next, changed } = applyTwinUpdates(profile(), {
      ...emptyTwinUpdates(),
      nationality: 'tz',
      traveller_type: 'student',
      diet_add: ['halal'],
      allergies_add: ['peanuts'],
      spice: 'mild',
      budget: 'low',
      loves_add: ['night markets', 'hotpot'],
    });
    assert.equal(next.nationality, 'TZ');
    assert.equal(next.traveller_type, 'student');
    assert.deepEqual(next.preferences.diet, ['halal']);
    assert.deepEqual(next.preferences.allergies, ['peanuts']);
    assert.equal(next.preferences.spice, 'mild');
    assert.equal(next.preferences.budget, 'low');
    assert.deepEqual(next.loves, ['night markets', 'hotpot']);
    assert.deepEqual(changed.sort(), ['allergies', 'budget', 'diet', 'loves', 'nationality', 'spice', 'traveller_type']);
  });

  it('ignores invalid values from the model', () => {
    const before = profile({ nationality: 'KE' });
    const { profile: next, changed } = applyTwinUpdates(before, {
      nationality: 'XX',
      traveller_type: 'astronaut' as never,
      diet_add: ['paleo'],
      spice: 'volcanic' as never,
      budget: 'free' as never,
    });
    assert.deepEqual(next, before);
    assert.deepEqual(changed, []);
  });

  it('edits: removes and adds without duplicates, case-insensitively', () => {
    const before = profile({ preferences: { ...DefaultPreferences, diet: ['halal'], allergies: ['Peanuts'] }, loves: ['Temples'] });
    const { profile: next } = applyTwinUpdates(before, {
      diet_remove: ['halal'],
      diet_add: ['vegetarian', 'vegetarian'],
      allergies_remove: ['peanuts'],
      loves_add: ['temples', 'museums'],
    });
    assert.deepEqual(next.preferences.diet, ['vegetarian']);
    assert.deepEqual(next.preferences.allergies, []);
    assert.deepEqual(next.loves, ['Temples', 'museums']);
  });

  it('keeps lists short', () => {
    const { profile: next } = applyTwinUpdates(profile(), { loves_add: Array.from({ length: 40 }, (_, i) => `thing ${i}`) });
    assert.equal(next.loves.length, MAX_LOVES);
  });

  it('does not touch the input profile', () => {
    const before = profile();
    applyTwinUpdates(before, { diet_add: ['halal'], loves_add: ['tea'] });
    assert.deepEqual(before.preferences.diet, []);
    assert.deepEqual(before.loves, []);
  });
});

describe('twinDna', () => {
  it('is plain text with one line per part', () => {
    const dna = twinDna(
      profile({ nationality: 'TZ', city: 'Beijing', traveller_type: 'student', preferences: { ...DefaultPreferences, diet: ['halal'], allergies: ['peanuts'] }, loves: ['street food'] })
    );
    assert.equal(
      dna,
      [
        'From: Tanzania',
        'In China: student, in Beijing',
        'Diet: halal',
        'Allergies: peanuts',
        'Spice: medium',
        'Budget: mid-range (¥40–120 per person)',
        'Loves: street food',
        'Wants to: nothing yet',
      ].join('\n')
    );
  });

  it('says what is not known yet', () => {
    assert.match(twinDna(profile()), /From: not known yet[\s\S]*Loves: not known yet/);
  });
});

describe('twinMissing', () => {
  it('lists what the chat should ask next, in order', () => {
    assert.deepEqual(twinMissing(profile()).slice(0, 4), ['nationality', 'home_city', 'traveller_type', 'diet']);
    assert.ok(!twinMissing(profile({ nationality: 'TZ', loves: ['tea'] })).includes('nationality'));
  });
});

describe('chat captures', () => {
  it('adds wishes and removes them when done', () => {
    const { profile: wished } = applyTwinUpdates(profile(), { wants_add: ['climb the Great Wall', 'try Peking duck'] });
    assert.deepEqual(wished.wants, ['climb the Great Wall', 'try Peking duck']);
    const { profile: done } = applyTwinUpdates(wished, { wants_remove: ['Climb the Great Wall'] });
    assert.deepEqual(done.wants, ['try Peking duck']);
  });

  it('keeps the home city for "somewhere like home"', () => {
    const { profile: next, changed } = applyTwinUpdates(profile({ nationality: 'TZ' }), { home_city: 'Dar es Salaam' });
    assert.deepEqual(changed, ['home_city']);
    assert.match(twinDna(next), /^From: Tanzania \(Dar es Salaam\)$/m);
  });

  it('describes what a capture changed, for the chat chip', () => {
    const before = profile({ loves: ['temples'] });
    const { profile: after } = applyTwinUpdates(before, { loves_add: ['night markets'], wants_add: ['see pandas'], allergies_add: ['shrimp'], diet_add: ['halal'] });
    assert.deepEqual(dnaChanges(before, after), ['Loves: night markets', 'Wants to: see pandas', 'Diet: halal', 'Allergic to: shrimp']);
    assert.deepEqual(dnaChanges(after, after), []);
  });

  it('nothing said about themselves: nothing changes', () => {
    const before = profile({ loves: ['hotpot'] });
    const { changed } = applyTwinUpdates(before, emptyTwinUpdates());
    assert.deepEqual(changed, []);
  });
});

describe('twinFromRow', () => {
  it('reads a profiles row, with defaults for missing columns', () => {
    const twin = twinFromRow({ nationality: 'KE', traveller_type: 'pilot', preferences: { diet: ['halal'] } });
    assert.equal(twin.nationality, 'KE');
    assert.equal(twin.traveller_type, null);
    assert.deepEqual(twin.preferences.diet, ['halal']);
    assert.deepEqual(twin.loves, []);
    assert.deepEqual(twin.wants, []);
  });
});
