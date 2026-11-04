// places-chat: the Places chat (src/app/api/places-chat+api.ts) on self-hosted Supabase. EAS Hosting runs API routes
// on Cloudflare Workers, which caps the outgoing requests one invocation may make; a Places chat turn (Qwen, AMap,
// Supabase, Mapbox) goes over it. There, the route forwards the request here instead (see forwardToSupabase in the
// route), so the app keeps calling /api/places-chat and needs no rebuild.
//
// handler.js is the route as `expo export` bundles it, wrapped as an ES module by scripts/build-places-function.mjs
// (generated, not in git). Rebuild it after changing the route or anything it uses:
//   npm run build:places-function && scripts/vps/deploy-function.sh
//
// The route reads process.env; here those names are mapped from the functions container's own environment:
// SUPABASE_URL (internal, so database calls stay on the VPS), SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, plus the
// secrets generate-stories already uses: QWEN_API_KEY, AMAP_KEY and the optional QWEN_* settings.
const env = (name: string) => Deno.env.get(name) || undefined;

(globalThis as { __HAO_ENV?: Record<string, string | undefined> }).__HAO_ENV = {
  EXPO_PUBLIC_SUPABASE_URL: env('SUPABASE_URL'),
  EXPO_PUBLIC_SUPABASE_KEY: env('SUPABASE_ANON_KEY'),
  SUPABASE_SECRET_KEY: env('SUPABASE_SERVICE_ROLE_KEY'),
  AMAP_KEY: env('AMAP_KEY'),
  AI_PROVIDER: env('AI_PROVIDER'),
  QWEN_API_KEY: env('QWEN_API_KEY'),
  QWEN_BASE_URL: env('QWEN_BASE_URL'),
  QWEN_MODEL: env('QWEN_MODEL'),
  QWEN_FAST_MODEL: env('QWEN_FAST_MODEL'),
  QWEN_ROOM_MODEL: env('QWEN_ROOM_MODEL'),
  QWEN_AUDIO_MODEL: env('QWEN_AUDIO_MODEL'),
  QWEN_THINKING: env('QWEN_THINKING'),
  // The public Mapbox token (day plan routes) is built into handler.js when this is unset.
  EXPO_PUBLIC_MAPBOX_TOKEN: env('MAPBOX_TOKEN'),
};

type Route = { POST: (request: Request) => Promise<Response> };
// Imported after __HAO_ENV is set: the bundle reads it once, when it loads.
// @ts-ignore: generated JavaScript without types
const { POST } = (await import('./handler.js')).default as Route;

Deno.serve((request) => (request.method === 'POST' ? POST(request) : Response.json({ error: 'POST only' }, { status: 405 })));
