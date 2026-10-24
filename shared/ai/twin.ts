// The digital twin ("Hao DNA"): what Hao knows about the user, built and edited by chatting. Pure
// functions shared by the API route, the app and the unit tests (twin.test.ts, `node --test`).
// Model output is untrusted: applyTwinUpdates keeps only valid values.
import { Countries } from '../places/countries.ts';
import { BudgetLabels, DefaultPreferences, DietLabels, parsePreferences, SpiceLabels } from './preferences.ts';
import type { Budget, DietTag, SpiceLevel, TravellerType, TwinProfile, TwinUpdates } from './types';

export const MAX_LOVES = 20;
export const MAX_WANTS = 20;
const MAX_ALLERGIES = 12;

/** Columns of public.profiles the twin is made of. */
export const TWIN_COLUMNS = 'nationality, home_city, city, traveller_type, preferences, loves, wants, experiences' as const;

/** The twin from a profiles row (any of the TWIN_COLUMNS may be missing or null). */
export function twinFromRow(row: Partial<Record<'nationality' | 'home_city' | 'city' | 'traveller_type', string | null>> & { preferences?: unknown; loves?: string[] | null; wants?: string[] | null; experiences?: string[] | null }): TwinProfile {
  const type = row.traveller_type;
  return {
    nationality: row.nationality ?? null,
    home_city: row.home_city ?? null,
    city: row.city ?? null,
    traveller_type: type === 'student' || type === 'tourist' ? (type as TravellerType) : null,
    preferences: parsePreferences(row.preferences) ?? DefaultPreferences,
    loves: row.loves ?? [],
    wants: row.wants ?? [],
    experiences: row.experiences ?? [],
  };
}

export const emptyTwinUpdates = (): TwinUpdates => ({
  nationality: '',
  home_city: '',
  city: '',
  traveller_type: '',
  diet_add: [],
  diet_remove: [],
  allergies_add: [],
  allergies_remove: [],
  spice: '',
  budget: '',
  loves_add: [],
  loves_remove: [],
  wants_add: [],
  wants_remove: [],
  notes: '',
});

const clean = (list: unknown, max: number) =>
  (Array.isArray(list) ? list : [])
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim().replace(/\s+/g, ' ').slice(0, max))
    .filter(Boolean);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const without = (list: string[], remove: string[]) => list.filter((x) => !remove.some((r) => same(r, x)));
const withAdded = (list: string[], add: string[]) =>
  add.reduce((out, a) => (out.some((x) => same(x, a)) ? out : [...out, a]), list);

/** What the twin doesn't know yet, in the order the chat asks about it. */
export function twinMissing(p: TwinProfile, asked: { allergies?: boolean; diet?: boolean } = {}) {
  const missing: ('nationality' | 'home_city' | 'traveller_type' | 'diet' | 'allergies' | 'spice' | 'budget' | 'loves')[] = [];
  if (!p.nationality) missing.push('nationality');
  if (!p.home_city) missing.push('home_city');
  if (!p.traveller_type) missing.push('traveller_type');
  if (!p.preferences.diet.length && !asked.diet) missing.push('diet');
  if (!p.preferences.allergies.length && !asked.allergies) missing.push('allergies');
  if (p.preferences.spice === DefaultPreferences.spice) missing.push('spice');
  if (p.preferences.budget === DefaultPreferences.budget) missing.push('budget');
  if (!p.loves.length) missing.push('loves');
  return missing;
}

/** Applies the model's proposed changes, keeping only valid ones. `changed` names what actually changed. */
export function applyTwinUpdates(profile: TwinProfile, raw: Partial<TwinUpdates>): { profile: TwinProfile; changed: string[] } {
  const u = { ...emptyTwinUpdates(), ...raw };
  const next: TwinProfile = { ...profile, preferences: { ...profile.preferences }, loves: [...profile.loves], wants: [...profile.wants], experiences: [...profile.experiences] };
  const changed: string[] = [];

  const nationality = String(u.nationality ?? '').trim().toUpperCase();
  if (nationality in Countries && nationality !== profile.nationality) {
    next.nationality = nationality;
    changed.push('nationality');
  }
  const homeCity = String(u.home_city ?? '').trim().slice(0, 80);
  if (homeCity && homeCity !== profile.home_city) {
    next.home_city = homeCity;
    changed.push('home_city');
  }
  const city = String(u.city ?? '').trim().slice(0, 80);
  if (city && city !== profile.city) {
    next.city = city;
    changed.push('city');
  }
  if ((u.traveller_type === 'student' || u.traveller_type === 'tourist') && u.traveller_type !== profile.traveller_type) {
    next.traveller_type = u.traveller_type;
    changed.push('traveller_type');
  }

  const isDiet = (d: string): d is DietTag => d in DietLabels;
  const diet = withAdded(without(next.preferences.diet, clean(u.diet_remove, 20)), clean(u.diet_add, 20).filter(isDiet)) as DietTag[];
  if (diet.join() !== profile.preferences.diet.join()) {
    next.preferences.diet = diet;
    changed.push('diet');
  }
  const allergies = withAdded(without(next.preferences.allergies, clean(u.allergies_remove, 40)), clean(u.allergies_add, 40)).slice(0, MAX_ALLERGIES);
  if (allergies.join() !== profile.preferences.allergies.join()) {
    next.preferences.allergies = allergies;
    changed.push('allergies');
  }
  if (u.spice && u.spice in SpiceLabels && u.spice !== profile.preferences.spice) {
    next.preferences.spice = u.spice as SpiceLevel;
    changed.push('spice');
  }
  if (u.budget && u.budget in BudgetLabels && u.budget !== profile.preferences.budget) {
    next.preferences.budget = u.budget as Budget;
    changed.push('budget');
  }
  const loves = withAdded(without(next.loves, clean(u.loves_remove, 60)), clean(u.loves_add, 60)).slice(0, MAX_LOVES);
  if (loves.join('|') !== profile.loves.join('|')) {
    next.loves = loves;
    changed.push('loves');
  }
  const wants = withAdded(without(next.wants, clean(u.wants_remove, 80)), clean(u.wants_add, 80)).slice(-MAX_WANTS);
  if (wants.join('|') !== profile.wants.join('|')) {
    next.wants = wants;
    changed.push('wants');
  }
  const notes = String(u.notes ?? '').trim().slice(0, 200);
  if (notes && notes !== profile.preferences.notes) {
    next.preferences.notes = notes;
    changed.push('notes');
  }
  return { profile: next, changed };
}

/**
 * The twin as plain text, the "Hao DNA" shown in Me and given to every agent. Built from the stored
 * profile only, so it always says exactly what Hao knows.
 */
export function twinDna(p: TwinProfile, o: { countryName?: (code: string) => string } = {}): string {
  const country = p.nationality ? (o.countryName?.(p.nationality) ?? Countries[p.nationality] ?? p.nationality) : null;
  const prefs = p.preferences;
  const lines = [
    `From: ${country ? `${country}${p.home_city ? ` (${p.home_city})` : ''}` : 'not known yet'}`,
    `In China: ${[p.traveller_type ? (p.traveller_type === 'student' ? 'student' : 'tourist') : null, p.city ? `in ${p.city}` : null].filter(Boolean).join(', ') || 'not known yet'}`,
    `Diet: ${prefs.diet.length ? prefs.diet.map((d) => DietLabels[d].en.toLowerCase()).join(', ') : 'no restrictions'}`,
    `Allergies: ${prefs.allergies.length ? prefs.allergies.join(', ') : 'none'}`,
    `Spice: ${SpiceLabels[prefs.spice].en.toLowerCase()}`,
    `Budget: ${BudgetLabels[prefs.budget].en.toLowerCase()} (${BudgetLabels[prefs.budget].range})`,
    `Loves: ${p.loves.length ? p.loves.join(', ') : 'not known yet'}`,
    `Wants to: ${p.wants.length ? p.wants.join(', ') : 'nothing yet'}`,
  ];
  // The latest saved conversations: what they have already done in China.
  if (p.experiences.length) lines.push(`Saved conversations: ${p.experiences.slice(-5).reverse().join('; ')}`);
  if (prefs.notes?.trim()) lines.push(`Notes: ${prefs.notes.trim()}`);
  return lines.join('\n');
}

/** What a capture changed, in short English lines for the chat's "Saved to your Hao DNA" chip. */
export function dnaChanges(before: TwinProfile, after: TwinProfile): string[] {
  const added = (a: string[], b: string[]) => b.filter((x) => !a.some((y) => same(x, y)));
  const removed = (a: string[], b: string[]) => a.filter((x) => !b.some((y) => same(x, y)));
  const lines: string[] = [];
  for (const x of added(before.loves, after.loves)) lines.push(`Loves: ${x}`);
  for (const x of removed(before.loves, after.loves)) lines.push(`No longer loves: ${x}`);
  for (const x of added(before.wants, after.wants)) lines.push(`Wants to: ${x}`);
  for (const x of removed(before.wants, after.wants)) lines.push(`Done or dropped: ${x}`);
  for (const d of added(before.preferences.diet, after.preferences.diet)) lines.push(`Diet: ${DietLabels[d as DietTag].en.toLowerCase()}`);
  for (const d of removed(before.preferences.diet, after.preferences.diet)) lines.push(`Diet removed: ${DietLabels[d as DietTag].en.toLowerCase()}`);
  for (const x of added(before.preferences.allergies, after.preferences.allergies)) lines.push(`Allergic to: ${x}`);
  for (const x of removed(before.preferences.allergies, after.preferences.allergies)) lines.push(`No longer allergic to: ${x}`);
  if (before.preferences.spice !== after.preferences.spice) lines.push(`Spice: ${SpiceLabels[after.preferences.spice].en.toLowerCase()}`);
  if (before.preferences.budget !== after.preferences.budget) lines.push(`Budget: ${BudgetLabels[after.preferences.budget].en.toLowerCase()}`);
  if (before.nationality !== after.nationality && after.nationality) lines.push(`From: ${Countries[after.nationality] ?? after.nationality}`);
  if (before.home_city !== after.home_city && after.home_city) lines.push(`Home city: ${after.home_city}`);
  if (before.traveller_type !== after.traveller_type && after.traveller_type) lines.push(`In China as a ${after.traveller_type}`);
  if (before.preferences.notes !== after.preferences.notes && after.preferences.notes) lines.push(`Note: ${after.preferences.notes}`);
  return lines;
}
