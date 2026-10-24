// Diet markers on stories. The generator tags each story from its facts (never from model output), and
// the feed hides stories that clash with the user's diet or allergies. Same patterns as place ranking.
import { ALLERGEN_PATTERNS, PATTERNS } from '../places/diet-patterns.ts';

/** Topic tags such as contains:pork, diet:halal, allergen:peanut for a dish or place description. */
export function dietTags(text: string): string[] {
  const tags: string[] = [];
  const halal = PATTERNS.halal.test(text);
  if (halal) tags.push('diet:halal');
  if (PATTERNS.vegetarian.test(text)) tags.push('diet:vegetarian');
  if (!halal && PATTERNS.pork.test(text)) tags.push('contains:pork');
  if (!halal && PATTERNS.alcohol.test(text)) tags.push('contains:alcohol');
  if (PATTERNS.beef.test(text)) tags.push('contains:beef');
  if (PATTERNS.seafood.test(text)) tags.push('contains:seafood');
  if (PATTERNS.meatCentric.test(text) || PATTERNS.pork.test(text) || PATTERNS.beef.test(text)) tags.push('contains:meat');
  for (const rule of ALLERGEN_PATTERNS) if (rule.place.test(text)) tags.push(`allergen:${rule.key}`);
  return [...new Set(tags)];
}

/** The allergen key for something a user typed ("peanuts", "shrimp"), or null if we don't know it. */
export function allergenKey(allergy: string): string | null {
  return ALLERGEN_PATTERNS.find((r) => r.match.test(allergy.trim()))?.key ?? null;
}

/** Why a story must not be shown to someone with this diet, or null. */
export function dietConflict(topics: string[], diet: string[], allergies: string[]): string | null {
  const has = new Set(topics);
  const d = new Set(diet);
  if (d.has('halal') && !has.has('diet:halal') && (has.has('contains:pork') || has.has('contains:alcohol'))) return 'halal';
  if ((d.has('no_pork') || d.has('kosher')) && has.has('contains:pork')) return 'no_pork';
  if ((d.has('vegetarian') || d.has('vegan')) && !has.has('diet:vegetarian') && has.has('contains:meat')) return 'vegetarian';
  if (d.has('no_beef') && has.has('contains:beef')) return 'no_beef';
  if (d.has('no_seafood') && has.has('contains:seafood')) return 'no_seafood';
  for (const allergy of allergies) {
    const key = allergenKey(allergy);
    if (key && has.has(`allergen:${key}`)) return `allergy:${allergy}`;
  }
  return null;
}
