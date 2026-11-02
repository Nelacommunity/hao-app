/// <reference types="node" />
// Unit tests for the Chinese order shown to the waiter. Run: npm run test:chat
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { orderLine } from './order.ts';

// The app's t(): fills {placeholders}; the English text stands in for any language.
const t = (s: string, p?: Record<string, unknown>) => s.replace(/\{(\w+)\}/g, (_, k) => String(p?.[k] ?? ''));

test('orderLine: dishes, portions and kitchen notes', () => {
  const line = orderLine(t as never, [{ zh: '牛肉面', name: 'Beef noodles', count: 1 }, { zh: '烤串', name: 'Skewers', count: 2 }, { zh: '红烧肉', name: 'Pork', count: 0 }],
    { diet: ['halal'], allergies: ['Peanuts'], spice: 'none', budget: 'medium' } as never);
  assert.match(line.zh, /^你好，我要点菜：一份牛肉面、两份烤串。/);
  assert.ok(!line.zh.includes('红烧肉'));
  assert.match(line.zh, /清真/); assert.match(line.zh, /花生过敏/); assert.match(line.zh, /不要放辣/);
  assert.match(line.meaning, /1 × Beef noodles, 2 × Skewers/);
});

test('orderLine: no profile means no kitchen notes', () => {
  const line = orderLine(t as never, [{ zh: '饺子', name: 'Dumplings', count: 3 }], null);
  assert.equal(line.zh, '你好，我要点菜：三份饺子。\n谢谢！');
  assert.equal(line.to, 'restaurant');
});

test('orderLine: vegan covers vegetarian and pork, allergies in other languages', () => {
  const line = orderLine(t as never, [{ zh: '炒青菜', name: 'Greens', count: 1 }], { diet: ['vegan', 'vegetarian', 'no_pork'], allergies: ['sésame', 'shrimp'], spice: 'mild', budget: 'low' } as never);
  assert.match(line.zh, /纯素/);
  assert.ok(!line.zh.includes('我吃素：'), 'vegan replaces the vegetarian note');
  assert.ok(!line.zh.includes('不要放猪肉和猪油'), 'no separate pork note');
  assert.match(line.zh, /我对虾、蟹和贝类、芝麻过敏/);
  assert.match(line.zh, /微辣/);
});
