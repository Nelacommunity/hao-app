// AMap's security proxy (JS API 2.0 `serviceHost`): the map page calls AMap through here, and the security
// code is added on the server, so it never ships in the app. Same forwarding as AMap's nginx example:
// https://lbs.amap.com/api/javascript-api-v2/guide/abc/jscode
// Only AMap API paths, and only for our own JS key, so it can't be used as an open proxy for other keys.
const PREFIX = '/api/_AMapService/';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };

function target(path: string) {
  if (path.startsWith('v4/map/styles')) return `https://webapi.amap.com/${path}`;
  if (/^v[3-5]\/[\w/-]+$/.test(path)) return `https://restapi.amap.com/${path}`;
  return null;
}

export async function GET(request: Request) {
  const code = process.env.AMAP_SECURITY_CODE;
  const key = process.env.EXPO_PUBLIC_AMAP_JS_KEY;
  if (!code || !key) return Response.json({ error: 'AMap proxy is not set up.' }, { status: 503, headers: cors });

  const url = new URL(request.url);
  const path = url.pathname.startsWith(PREFIX) ? url.pathname.slice(PREFIX.length) : '';
  const base = target(path);
  if (!base || url.searchParams.get('key') !== key) return Response.json({ error: 'Not allowed.' }, { status: 403, headers: cors });

  const params = new URLSearchParams(url.searchParams);
  params.set('jscode', code);
  const res = await fetch(`${base}?${params}`);
  const headers = new Headers(cors);
  const type = res.headers.get('Content-Type');
  if (type) headers.set('Content-Type', type);
  return new Response(res.body, { status: res.status, headers });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}
