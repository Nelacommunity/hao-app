import type { AutonomyKey, Budget, DietTag, Preferences, SpiceLevel } from './types';
import { tx } from '../i18n/tx';

export const DefaultPreferences: Preferences = { diet: [], allergies: [], spice: 'medium', budget: 'medium', autonomy: ['spice', 'here_or_to_go'] };

export const AutonomyLabels: Record<AutonomyKey, string> = {
  spice: tx('Spice level'),
  here_or_to_go: tx('For here or to go'),
  drinks: tx('Drinks'),
  small_choices: tx('Small choices within budget'),
};

export const DietLabels: Record<DietTag, { en: string; zh: string }> = {
  vegetarian: { en: tx('Vegetarian'), zh: '素食（不吃肉和鱼）' },
  vegan: { en: tx('Vegan'), zh: '纯素（不吃肉、鱼、蛋、奶）' },
  halal: { en: tx('Halal'), zh: '清真' },
  kosher: { en: tx('Kosher'), zh: '犹太洁食' },
  no_pork: { en: tx('No pork'), zh: '不吃猪肉' },
  no_beef: { en: tx('No beef'), zh: '不吃牛肉' },
  no_seafood: { en: tx('No seafood'), zh: '不吃海鲜' },
};

export const SpiceLabels: Record<SpiceLevel, { en: string; zh: string }> = {
  none: { en: tx('No spice'), zh: '不要辣' },
  mild: { en: tx('Mild'), zh: '微辣' },
  medium: { en: tx('Medium'), zh: '中辣' },
  hot: { en: tx('Hot'), zh: '特辣也可以' },
};

export const BudgetLabels: Record<Budget, { en: string; range: string }> = {
  low: { en: tx('Budget'), range: tx('under ¥40 per person') },
  medium: { en: tx('Mid-range'), range: tx('¥40–120 per person') },
  high: { en: tx('Splurge'), range: tx('over ¥120 per person is fine') },
};

export const CommonAllergies = ['peanuts', 'tree nuts', 'shellfish', 'fish', 'eggs', 'dairy', 'gluten', 'soy', 'sesame'];

/** Plain-text summary injected into prompts. */
export function describePreferences(prefs: Preferences | null): string {
  if (!prefs) return 'No stored preferences.';
  const lines = [
    `Diet: ${prefs.diet.length ? prefs.diet.map((d) => `${DietLabels[d].en} (${DietLabels[d].zh})`).join(', ') : 'no restrictions'}`,
    `Allergies: ${prefs.allergies.length ? prefs.allergies.join(', ') : 'none'}`,
    `Spice tolerance: ${SpiceLabels[prefs.spice].en} (${SpiceLabels[prefs.spice].zh})`,
    `Budget: ${BudgetLabels[prefs.budget].en}, ${BudgetLabels[prefs.budget].range}`,
  ];
  const autonomy = prefs.autonomy ?? DefaultPreferences.autonomy ?? [];
  lines.push(`Hao may decide on its own: ${autonomy.length ? autonomy.map((a) => AutonomyLabels[a]).join(', ') : 'nothing, always ask'}`);
  if (prefs.notes?.trim()) lines.push(`Other notes: ${prefs.notes.trim()}`);
  return lines.join('\n');
}

/** Coerces untrusted JSON (e.g. from a request body) into valid preferences. */
export function parsePreferences(value: unknown): Preferences | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const diet = Array.isArray(v.diet) ? v.diet.filter((d): d is DietTag => typeof d === 'string' && d in DietLabels) : [];
  const allergies = Array.isArray(v.allergies)
    ? v.allergies.filter((a): a is string => typeof a === 'string').map((a) => a.slice(0, 40)).slice(0, 12)
    : [];
  const spice = typeof v.spice === 'string' && v.spice in SpiceLabels ? (v.spice as SpiceLevel) : DefaultPreferences.spice;
  const budget = typeof v.budget === 'string' && v.budget in BudgetLabels ? (v.budget as Budget) : DefaultPreferences.budget;
  const notes = typeof v.notes === 'string' ? v.notes.slice(0, 200) : undefined;
  const autonomy = Array.isArray(v.autonomy)
    ? v.autonomy.filter((a): a is AutonomyKey => typeof a === 'string' && a in AutonomyLabels)
    : DefaultPreferences.autonomy;
  return { diet, allergies, spice, budget, autonomy, notes };
}
