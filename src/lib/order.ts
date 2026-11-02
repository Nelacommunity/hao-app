// "I want this" for a restaurant: the dishes the traveller ticked on a scanned menu, as one polite line in Chinese
// for the waiter, plus what the kitchen must know from their diet, allergies and spice tolerance. Built here,
// not by the model, so it works offline and never adds a dish they didn't pick.
import type { Preferences, StaffLine } from '@shared/ai/types';

import type { useT } from '@/lib/i18n';

type T = ReturnType<typeof useT>;

export type OrderPick = { zh: string; name: string; count: number };

const COUNTS = ['', '一', '两', '三', '四', '五', '六', '七', '八', '九', '十'];
const portions = (n: number) => `${n <= 10 ? COUNTS[n] : n}份`;

/** Common allergens as a Chinese kitchen would name them; matched on what the traveller typed in any case. */
const ALLERGENS: [RegExp, string][] = [
  [/peanut|花生|cacahu|arachid|erdnuss/i, '花生'],
  [/tree ?nut|\bnuts?\b|walnut|cashew|almond|坚果|核桃|腰果/i, '坚果'],
  [/shellfish|shrimp|prawn|crab|lobster|虾|蟹|贝/i, '虾、蟹和贝类'],
  [/\bfish\b|鱼/i, '鱼'],
  [/\beggs?\b|蛋/i, '鸡蛋'],
  [/milk|dairy|lactose|牛奶|乳/i, '牛奶和奶制品'],
  [/gluten|wheat|麸质|小麦/i, '小麦（面筋）'],
  [/\bsoy|soya|大豆|黄豆/i, '大豆'],
  [/sesam|芝麻/i, '芝麻'],
  [/msg|味精/i, '味精'],
];

/** Lines for the kitchen, Chinese with the traveller's-language meaning, from their saved preferences. */
function kitchenNotes(t: T, prefs: Preferences | null): { zh: string; meaning: string }[] {
  if (!prefs) return [];
  const notes: { zh: string; meaning: string }[] = [];
  const diet = new Set(prefs.diet);
  if (diet.has('vegan')) notes.push({ zh: '我吃纯素：请不要放肉、鱼、蛋和奶，也不要用肉汤。', meaning: t('I’m vegan: no meat, fish, eggs or dairy, and no meat stock.') });
  else if (diet.has('vegetarian')) notes.push({ zh: '我吃素：请不要放肉和鱼，也不要用肉汤。', meaning: t('I’m vegetarian: no meat or fish, and no meat stock.') });
  if (diet.has('halal')) notes.push({ zh: '我吃清真：请不要放猪肉、猪油和酒。', meaning: t('I eat halal: no pork, lard or alcohol.') });
  else if (diet.has('kosher')) notes.push({ zh: '我不吃猪肉和贝类海鲜。', meaning: t('I don’t eat pork or shellfish.') });
  else if (diet.has('no_pork') && !diet.has('vegetarian') && !diet.has('vegan')) notes.push({ zh: '请不要放猪肉和猪油。', meaning: t('No pork or lard, please.') });
  if (diet.has('no_beef') && !diet.has('vegetarian') && !diet.has('vegan')) notes.push({ zh: '请不要放牛肉。', meaning: t('No beef, please.') });
  if (diet.has('no_seafood') && !diet.has('vegan')) notes.push({ zh: '请不要放海鲜。', meaning: t('No seafood, please.') });

  // Accents off, so "sésame" or "cacahuète" match like their plain spellings.
  const plain = prefs.allergies.map((a) => a.normalize('NFD').replace(/\p{M}/gu, ''));
  const allergens = ALLERGENS.filter(([re]) => plain.some((a) => re.test(a))).map(([, zh]) => zh);
  if (allergens.length) {
    notes.push({
      zh: `我对${allergens.join('、')}过敏，请一定不要放。`,
      meaning: t('I’m allergic to {allergens}: please leave them out completely.', { allergens: prefs.allergies.join(', ') }),
    });
  }
  if (prefs.spice === 'none') notes.push({ zh: '请不要放辣。', meaning: t('Not spicy, please.') });
  else if (prefs.spice === 'mild') notes.push({ zh: '微辣就好。', meaning: t('Only a little spicy, please.') });
  return notes;
}

/** The order for the waiter: "你好，我要点菜：一份牛肉面、两份红烧肉。" plus kitchen notes. */
export function orderLine(t: T, picks: OrderPick[], prefs: Preferences | null): StaffLine {
  const dishes = picks.filter((p) => p.count > 0);
  const notes = kitchenNotes(t, prefs);
  return {
    zh: [`你好，我要点菜：${dishes.map((d) => `${portions(d.count)}${d.zh}`).join('、')}。`, ...notes.map((n) => n.zh), '谢谢！'].join('\n'),
    meaning: [
      t('Hello, I’d like to order: {dishes}.', { dishes: dishes.map((d) => `${d.count} × ${d.name}`).join(', ') }),
      ...notes.map((n) => n.meaning),
      t('Thank you!'),
    ].join('\n'),
    to: 'restaurant',
  };
}
