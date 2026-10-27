// Cold-start seeding: imports places and survey likes from a CSV into public.places and public.seeded_likes.
//
//   npm run seed:places -- scripts/seed/my-survey.csv [--dry-run]
//
// CSV columns: name, name_zh, amap_poi_id or address, category (food|attraction|shop|service),
// tags (separated by ; ), nationality (ISO code, e.g. TZ), likes. One row per place and nationality.
// Each place is looked up on AMap (by POI id, else by name near the address) for its coordinates.
//
// Needs, in the local .env only: EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY (service role) and AMAP_KEY.
// The secret key bypasses row-level security: never ship it in the app or commit it.
import { readFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';

try {
  process.loadEnvFile(new URL('../.env', import.meta.url));
} catch {
  // Variables may come from the shell instead.
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const file = args.find((a) => !a.startsWith('--')) ?? new URL('./seed/places-sample.csv', import.meta.url).pathname;

const CATEGORIES = new Set(['food', 'attraction', 'shop', 'service']);
const isPlaceholder = (v) => /^\[.*\]$/.test(v.trim());

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, commas and newlines inside quotes). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);
  const [header, ...body] = rows;
  const keys = header.map((h) => h.trim().toLowerCase());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

async function amap(path, params) {
  const key = process.env.AMAP_KEY;
  if (!key) throw new Error('AMAP_KEY is not set in .env');
  const url = new URL(path, 'https://restapi.amap.com');
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  url.searchParams.set('key', key);
  const json = await (await fetch(url)).json();
  if (json.status !== '1') throw new Error(`AMap: ${json.info} (${json.infocode})`);
  return json;
}

const text = (v) => (typeof v === 'string' ? v.trim() : '');

/** The AMap POI for a row: by id, else the best name match near the address, else just the address's coordinates. */
async function locate(row) {
  if (row.amap_poi_id) {
    const { pois = [] } = await amap('/v5/place/detail', { id: row.amap_poi_id, show_fields: 'business' });
    if (pois[0]) return { poi: pois[0] };
    throw new Error(`no AMap POI ${row.amap_poi_id}`);
  }
  if (!row.address) throw new Error('needs amap_poi_id or address');
  const { geocodes = [] } = await amap('/v3/geocode/geo', { address: row.address });
  const location = geocodes[0]?.location;
  if (!location) throw new Error(`AMap could not find the address "${row.address}"`);
  const { pois = [] } = await amap('/v5/place/around', { keywords: row.name_zh || row.name, location, radius: '300', show_fields: 'business' });
  return pois[0] ? { poi: pois[0] } : { location };
}

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!dryRun && (!url || !secret)) {
  console.error('Set EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env (or use --dry-run).');
  process.exit(1);
}
const db = dryRun ? null : createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

const rows = parseCsv(readFileSync(file, 'utf8'));
let imported = 0;
let skipped = 0;

for (const [i, row] of rows.entries()) {
  const line = `row ${i + 2}`;
  const nationality = row.nationality.toUpperCase();
  const likes = Number.parseInt(row.likes, 10);
  if ([row.name, row.amap_poi_id, row.address].some((v) => v && isPlaceholder(v))) {
    console.warn(`${line}: skipped, still a [PLACEHOLDER]. Replace it with a real place from your survey.`);
    skipped++;
    continue;
  }
  if (!row.name || !CATEGORIES.has(row.category) || !/^[A-Z]{2}$/.test(nationality) || !(likes >= 0)) {
    console.warn(`${line}: skipped, needs name, category (food|attraction|shop|service), a 2-letter nationality and likes.`);
    skipped++;
    continue;
  }

  try {
    const found = await locate(row);
    const [lng, lat] = (found.poi?.location ?? found.location).split(',').map(Number);
    const rating = Number(text(found.poi?.business?.rating));
    const place = {
      amap_poi_id: found.poi?.id ?? null,
      name: row.name,
      name_zh: row.name_zh || text(found.poi?.name),
      category: row.category,
      lat,
      lng,
      address: text(found.poi?.address) || row.address,
      tags: row.tags ? row.tags.split(/[;|]/).map((t) => t.trim()).filter(Boolean) : [],
      amap_rating: rating > 0 ? rating : null,
      source: 'seeded',
    };
    if (dryRun) {
      console.log(`${line}: would import ${place.name} (${place.amap_poi_id ?? 'no POI id'}) at ${lat},${lng} with ${likes} likes from ${nationality}`);
      imported++;
      continue;
    }

    let placeId;
    if (place.amap_poi_id) {
      const { data, error } = await db.from('places').upsert(place, { onConflict: 'amap_poi_id' }).select('id').single();
      if (error) throw error;
      placeId = data.id;
    } else {
      // Without a POI id, reuse a seeded place with the same name and address.
      const { data: existing } = await db.from('places').select('id').eq('source', 'seeded').eq('name', place.name).eq('address', place.address).maybeSingle();
      const { data, error } = existing ? { data: existing, error: null } : await db.from('places').insert(place).select('id').single();
      if (error) throw error;
      placeId = data.id;
    }
    // The insert trigger recomputes the place's stats.
    const { error } = await db.from('seeded_likes').upsert({ place_id: placeId, nationality, likes }, { onConflict: 'place_id,nationality' });
    if (error) throw error;
    console.log(`${line}: ${place.name} ← ${likes} likes from ${nationality}`);
    imported++;
  } catch (e) {
    console.warn(`${line}: skipped, ${e.message}`);
    skipped++;
  }
}

console.log(`\n${dryRun ? 'Checked' : 'Imported'} ${imported} row(s), skipped ${skipped}.`);
