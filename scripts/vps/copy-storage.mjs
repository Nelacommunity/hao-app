// Copies every Storage file (story-images, visit-photos, …) from the hosted project to the VPS through
// each side's Storage API with its service key. The SQL dump only has the files' rows, not the files.
// Safe to run again: files already on the VPS with the same size are skipped.
//
//   node --env-file=.vps.env.local scripts/vps/copy-storage.mjs
//
// Needs OLD_API_URL, OLD_SERVICE_KEY, NEW_API_URL, NEW_SERVICE_KEY (see scripts/vps/vps.env.example).
import { createClient } from '@supabase/supabase-js';

const env = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see scripts/vps/vps.env.example)`);
  return value;
};
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const from = createClient(env('OLD_API_URL'), env('OLD_SERVICE_KEY'), options);
const to = createClient(env('NEW_API_URL'), env('NEW_SERVICE_KEY'), options);
const PARALLEL = 4;
const PAGE = 1000;

/** Every file in a bucket (folders are walked), with its size and type. */
async function listAll(client, bucket, prefix = '') {
  const files = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await client.storage.from(bucket).list(prefix, { limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      // Folders have no id.
      if (entry.id === null) files.push(...(await listAll(client, bucket, path)));
      else files.push({ path, size: entry.metadata?.size ?? null, type: entry.metadata?.mimetype ?? 'application/octet-stream' });
    }
    if (data.length < PAGE) return files;
  }
}

async function ensureBucket(bucket) {
  const { data } = await to.storage.getBucket(bucket.id);
  if (data) return;
  const { error } = await to.storage.createBucket(bucket.id, {
    public: bucket.public,
    fileSizeLimit: bucket.file_size_limit ?? undefined,
    allowedMimeTypes: bucket.allowed_mime_types ?? undefined,
  });
  if (error) throw new Error(`create bucket ${bucket.id}: ${error.message}`);
}

async function copyBucket(bucket) {
  await ensureBucket(bucket);
  const [files, there] = await Promise.all([listAll(from, bucket.id), listAll(to, bucket.id).catch(() => [])]);
  const done = new Map(there.map((f) => [f.path, f.size]));
  const todo = files.filter((f) => f.size === null || done.get(f.path) !== f.size);
  console.log(`${bucket.id}: ${files.length} files, ${files.length - todo.length} already there, copying ${todo.length}`);

  let copied = 0;
  const failed = [];
  const queue = [...todo];
  await Promise.all(
    Array.from({ length: PARALLEL }, async () => {
      for (let file = queue.shift(); file; file = queue.shift()) {
        try {
          const { data, error } = await from.storage.from(bucket.id).download(file.path);
          if (error) throw error;
          const { error: upError } = await to.storage.from(bucket.id).upload(file.path, await data.arrayBuffer(), { contentType: file.type, upsert: true });
          if (upError) throw upError;
          if (++copied % 50 === 0) console.log(`  ${bucket.id}: ${copied}/${todo.length}`);
        } catch (e) {
          failed.push(`${file.path}: ${e.message ?? e}`);
        }
      }
    })
  );
  console.log(`${bucket.id}: copied ${copied}, failed ${failed.length}`);
  for (const f of failed) console.log(`  failed ${bucket.id}/${f}`);
  return failed.length;
}

const { data: buckets, error } = await from.storage.listBuckets();
if (error) throw new Error(`list buckets: ${error.message}`);
let failures = 0;
for (const bucket of buckets) failures += await copyBucket(bucket);
if (failures) {
  console.error(`${failures} file(s) failed. Run again to retry them.`);
  process.exit(1);
}
console.log('Storage copied.');
