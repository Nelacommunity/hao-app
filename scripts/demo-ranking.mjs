// Demo: the two seeded users (supabase/seed.sql) ask "food near me" from the same spot.
// Signs in as each user with the publishable key (so row-level security applies), reads the places and
// get_place_social_proof, and ranks them with the app's own ranking (shared/places/ranking.ts).
//
//   npx supabase db reset && npm run demo:ranking
import { createClient } from '@supabase/supabase-js';

import { Countries, RegionLabels } from '../shared/places/countries.ts';
import { rankPlaces } from '../shared/places/ranking.ts';

try {
  process.loadEnvFile(new URL('../.env', import.meta.url));
} catch {
  // Variables may come from the shell instead.
}

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;
if (!url || !key) {
  console.error('Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY (see `npx supabase status`).');
  process.exit(1);
}

const HERE = { lat: 39.9088, lng: 116.3974 };
const metres = (a, b) => {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return Math.round(2 * 6_371_000 * Math.asin(Math.sqrt(h)));
};

const reasonText = (r) =>
  ({
    country: () => `Liked by ${r.count} people from ${Countries[r.nationality]}`,
    region: () => `Popular with ${RegionLabels[r.region]} students${r.city ? ` in ${r.city}` : ''}`,
    profile: () => `Matches your ${r.matches?.join(' and ')} preferences`,
    rating: () => 'Highly rated nearby',
    nearby: () => 'Close to you',
  })[r.kind]();

for (const email of ['demo-tz@hao.test', 'demo-ru@hao.test']) {
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data: auth, error } = await db.auth.signInWithPassword({ email, password: 'hao-demo-pass' });
  if (error) throw new Error(`${email}: ${error.message}. Did you run \`npx supabase db reset\`?`);

  const { data: profile } = await db.from('profiles').select('nationality, city, preferences').eq('id', auth.user.id).single();
  const { data: group } = await db.from('country_groups').select('region').eq('nationality', profile.nationality).maybeSingle();
  const { data: places } = await db.from('places').select('*').eq('category', 'food').eq('source', 'seeded');
  const { data: proofRows } = await db.rpc('get_place_social_proof', { place_ids: places.map((p) => p.id), nationality: profile.nationality });

  // A client can't read anyone's raw stats directly:
  const blocked = await db.from('place_country_stats').select('*').limit(1);

  const proof = new Map();
  for (const row of proofRows ?? []) {
    const amap = places.find((p) => p.id === row.place_id).amap_poi_id;
    const entry = proof.get(amap) ?? {};
    const stat = { visitors: row.visitor_count, likes: row.like_count, dislikes: row.dislike_count };
    if (row.scope === 'country') entry.country = stat;
    else entry.region = { ...stat, region: row.region };
    proof.set(amap, entry);
  }

  const ranked = rankPlaces(
    places.map((p) => ({ id: p.amap_poi_id, name: p.name, nameZh: p.name_zh, kind: 'food', typeZh: '', tags: p.tags, rating: p.amap_rating ?? undefined, distanceM: metres(HERE, p) })),
    {
      profile: { nationality: profile.nationality, region: group?.region ?? null, city: profile.city, diet: profile.preferences.diet ?? [], allergies: profile.preferences.allergies ?? [], spice: profile.preferences.spice ?? 'medium', budget: profile.preferences.budget ?? 'medium' },
      proof,
      myRatings: new Map(),
    }
  );

  console.log(`\n${email} (${Countries[profile.nationality]}) asks "food near me":`);
  ranked.slice(0, 3).forEach((r, i) => console.log(`  ${i + 1}. ${r.place.name}  —  ${reasonText(r.reason)}  (score ${r.score.toFixed(2)})`));
  console.log(`  Raw stats readable by this user: ${blocked.error ? `no (${blocked.error.code})` : 'YES, check RLS!'}`);
}
