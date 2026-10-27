// Puts the auth email templates (supabase/templates/*.html: 6-digit codes, not links) in a public Storage bucket
// on the VPS, so self-hosted Auth can download them, and prints the GOTRUE_MAILER_* values to set.
// Run again after changing a template, then restart the auth container (it caches templates).
//
//   node --env-file=.vps.env.local scripts/vps/upload-email-templates.mjs
//
// Needs NEW_API_URL and NEW_SERVICE_KEY (see scripts/vps/vps.env.example).
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const env = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see scripts/vps/vps.env.example)`);
  return value;
};
const BUCKET = 'email-templates';
const TEMPLATES = [
  { file: 'confirmation.html', name: 'CONFIRMATION', subject: 'Your Hao verification code' },
  { file: 'recovery.html', name: 'RECOVERY', subject: 'Reset your Hao password' },
];

const apiUrl = env('NEW_API_URL').replace(/\/+$/, '');
const db = createClient(apiUrl, env('NEW_SERVICE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });

const { data: bucket } = await db.storage.getBucket(BUCKET);
if (!bucket) {
  const { error } = await db.storage.createBucket(BUCKET, { public: true, allowedMimeTypes: ['text/html'] });
  if (error) throw new Error(`create bucket ${BUCKET}: ${error.message}`);
}

for (const t of TEMPLATES) {
  const html = await readFile(new URL(`../../supabase/templates/${t.file}`, import.meta.url));
  const { error } = await db.storage.from(BUCKET).upload(t.file, html, { contentType: 'text/html', upsert: true, cacheControl: '60' });
  if (error) throw new Error(`upload ${t.file}: ${error.message}`);
  console.log(`Uploaded ${t.file}`);
}

// Coolify derives GOTRUE_MAILER_* from these names in its compose file; plain docker sets the GOTRUE_ names directly.
console.log('\nCoolify → Environment Variables (then Redeploy). Without Coolify, prefix each name with GOTRUE_:\n');
for (const t of TEMPLATES) {
  console.log(`MAILER_TEMPLATES_${t.name}=${apiUrl}/storage/v1/object/public/${BUCKET}/${t.file}`);
  console.log(`MAILER_SUBJECTS_${t.name}=${t.subject}`);
}
