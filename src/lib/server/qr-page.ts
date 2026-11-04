// What a restaurant's table QR code points at, for the menu scanner. Most Chinese ordering codes open a WeChat or
// Alipay mini program (or a page that only works inside one), which a server can't read: those come back as
// `app`, and the app asks for a screenshot instead. Plain web menus are fetched and reduced to their visible text.
// When that shows no dishes, Hao looks where JavaScript menus keep them, without running any of the page's code:
//   1. the page's inline scripts (a JSON blob or an array of dishes), then
//   2. up to MAX_DATA_REQUESTS of the data addresses those scripts fetch (`fetch('/api/menu')`, `axios.get(…)`),
//      requested the same way the page would, keeping only the JSON that holds Chinese text.
// Menus that still don't show up (built by a bundled app, behind a login or token, or rendered in a mini program)
// come back without dishes, and the chat asks for a screenshot. See "Table QR menus" in the README.
//
// The URL comes from a stranger's QR code, so the fetch is guarded: http(s) on the default ports only, no IP
// literals or local names, every redirect checked again, a short timeout and a size cap.

export type QrContent =
  | { kind: 'text'; text: string }
  | { kind: 'page'; url: string; host: string; text: string }
  | { kind: 'app'; url: string; host: string; app: 'WeChat' | 'Alipay' | 'Meituan' | 'Dianping' | 'an app' }
  | { kind: 'unreadable'; url: string; host: string };

/** Hosts whose links only work inside an app, by app. Matched on the host and its parent domains. */
const APP_HOSTS: [string, Extract<QrContent, { kind: 'app' }>['app']][] = [
  ['weixin.qq.com', 'WeChat'],
  ['wx.qq.com', 'WeChat'],
  ['wxaurl.cn', 'WeChat'],
  ['wechat.com', 'WeChat'],
  ['qr.alipay.com', 'Alipay'],
  ['render.alipay.com', 'Alipay'],
  ['ds.alipay.com', 'Alipay'],
  ['alipay.com', 'Alipay'],
  ['meituan.com', 'Meituan'],
  ['dianping.com', 'Dianping'],
];

const MAX_BYTES = 1_500_000;
/** Data addresses found in a page's scripts that are requested at most, one after another. */
const MAX_DATA_REQUESTS = 3;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 8000;
/** Fewer Chinese characters than this and the page is a shell that draws its menu with JavaScript. */
const MIN_HAN = 12;

const HAN = /\p{Script=Han}/gu;

function appOf(host: string) {
  return APP_HOSTS.find(([h]) => host === h || host.endsWith(`.${h}`))?.[1] ?? null;
}

/** A URL that is safe to fetch from the server, or null. */
export function safeUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.port && url.port !== '80' && url.port !== '443') return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  // IP literals (v4, v6, and the decimal/hex shorthands URL() normalises into v4) and names without a public TLD.
  if (/^[\d.]+$/.test(host) || host.includes(':') || host.startsWith('[')) return null;
  if (!host.includes('.') || /(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain)$/.test(host)) return null;
  return url;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', yen: '¥' };

const PRICE = /[¥￥]\s*\d|\d+(?:\.\d+)?\s*元/g;
const MAX_SCRIPT_CHARS = 8000;

/**
 * Lines of the page's inline scripts (and JSON data blocks) that hold Chinese text, e.g.
 * `{ name: "北京烤鸭", desc: "…", price: 128 }`. Comment lines are dropped; external scripts are never fetched.
 */
export function scriptData(html: string): string {
  const lines: string[] = [];
  let size = 0;
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/i.test(m[1])) continue;
    for (const raw of m[2].replace(/\/\*[\s\S]*?\*\//g, ' ').split(/\n|(?<=[}\]],)/)) {
      const line = raw.replace(/\s+/g, ' ').trim();
      if (!line || /^\/\//.test(line) || !/\p{Script=Han}/u.test(line)) continue;
      const clipped = line.slice(0, 600);
      if (size + clipped.length > MAX_SCRIPT_CHARS) return lines.join('\n');
      lines.push(clipped);
      size += clipped.length + 1;
    }
  }
  return lines.join('\n');
}

/** The page's text for the model: what it shows, plus its script data when the visible part has no prices. */
export function pageText(html: string): string {
  const visible = htmlText(html);
  if ((visible.match(PRICE) ?? []).length >= 3) return visible;
  const data = scriptData(html);
  return data ? `${visible}\n\nMenu data inside the page's scripts (drawn by JavaScript):\n${data}` : visible;
}

/** The visible text of an HTML page, one line per block. */
export function htmlText(html: string): string {
  return html
    .replace(/<(script|style|noscript|template|svg|head)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|p|div|li|tr|h\d|section|article|dt|dd)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : ' ';
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  reader.cancel().catch(() => {});
  const all = new Uint8Array(Math.min(size, MAX_BYTES));
  let at = 0;
  for (const c of chunks) {
    const part = c.subarray(0, all.length - at);
    all.set(part, at);
    at += part.length;
    if (at >= all.length) break;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(all);
}

// ─── Menus a page loads from its server ──────────────────────────────────────

/** Menu words in Chinese or English: a page that says these but lists no dishes is a menu Hao couldn't read. */
export const MENU_WORDS = /菜单|菜品|点餐|点菜|扫码点|下单|购物车|招牌|套餐|\bmenu\b/i;

/** True when `text` already lists dishes: three prices, or three lines pairing Chinese with a number. */
export function hasDishes(text: string): boolean {
  if ((text.match(PRICE) ?? []).length >= 3) return true;
  return text.split('\n').filter((l) => /\p{Script=Han}/u.test(l) && /\d/.test(l)).length >= 3;
}

/**
 * Addresses the page's inline scripts request data from, resolved against the page and checked with safeUrl:
 * string arguments of fetch(), axios/$.get/getJSON/post, XMLHttpRequest.open(), `url:` options, and string
 * literals that look like data paths (/api/…, *.json). Addresses built at run time (`${table}`, "a" + b) are skipped.
 */
export function dataUrls(html: string, base: string): URL[] {
  const found = new Map<string, URL>();
  const add = (raw: string) => {
    if (!raw || /[`${}+]/.test(raw) || raw.startsWith('data:') || raw.startsWith('#')) return;
    let abs: string;
    try {
      abs = new URL(raw, base).href;
    } catch {
      return;
    }
    const url = safeUrl(abs);
    // Pictures, styles and scripts hold no menu data.
    if (url && !/\.(png|jpe?g|gif|webp|svg|ico|css|js|mjs|woff2?|ttf|mp4|mp3)(\?|$)/i.test(url.pathname)) found.set(url.href, url);
  };
  const STR = String.raw`(["'\x60])([^"'\x60\n]{1,300})\1`;
  const patterns = [
    new RegExp(String.raw`\b(?:fetch|axios(?:\.(?:get|post))?|\$\.(?:get|getJSON|post|ajax)|request|http\.get)\s*\(\s*${STR}`, 'g'),
    new RegExp(String.raw`\.open\s*\(\s*["']GET["']\s*,\s*${STR}`, 'gi'),
    new RegExp(String.raw`\burl\s*:\s*${STR}`, 'g'),
    new RegExp(String.raw`${STR}`, 'g'),
  ];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/i.test(m[1])) continue;
    const code = m[2];
    for (const [i, re] of patterns.entries()) {
      for (const hit of code.matchAll(re)) {
        const raw = hit[2].trim();
        // Any string literal only counts when it looks like a data path.
        if (i === 3 && !/^(https?:\/\/|\/|\.\/)?[\w./-]*(\/api\/|\.json(\?|$)|\/menu|\/dishes|\/goods|\/products)/i.test(raw)) continue;
        add(raw);
      }
    }
  }
  return [...found.values()].slice(0, MAX_DATA_REQUESTS);
}

/**
 * The Chinese records in a JSON reply, one line per object that holds Chinese text, with its short text and number
 * fields (`name: 北京烤鸭 · price: 128 · desc: …`). Links and long blobs are left out.
 */
export function jsonData(json: unknown, maxChars = 8000): string {
  const lines: string[] = [];
  let size = 0;
  const walk = (v: unknown, depth: number) => {
    if (size >= maxChars || depth > 12 || !v || typeof v !== 'object') return;
    if (Array.isArray(v)) {
      for (const x of v.slice(0, 500)) walk(x, depth + 1);
      return;
    }
    const fields: string[] = [];
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (typeof x === 'number' && Number.isFinite(x)) fields.push(`${k}: ${x}`);
      else if (typeof x === 'string' && x.length <= 200 && !/^(https?:|data:|\/\/)/.test(x) && x.trim()) fields.push(`${k}: ${x.trim()}`);
    }
    const line = fields.join(' · ');
    if (/\p{Script=Han}/u.test(line)) {
      const clipped = line.slice(0, 400);
      lines.push(clipped);
      size += clipped.length + 1;
    }
    for (const x of Object.values(v as Record<string, unknown>)) if (x && typeof x === 'object') walk(x, depth + 1);
  };
  walk(json, 0);
  return lines.join('\n').slice(0, maxChars);
}

type Fetched = { url: URL; type: string; body: string } | { error: 'app'; host: string } | { error: 'unreadable' };

/** GET with every redirect checked by safeUrl, a timeout and a size cap. App-only hosts stop the request. */
async function guardedGet(start: URL, accept: string): Promise<Fetched> {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const host = url.hostname.toLowerCase();
    if (appOf(host)) return { error: 'app', host };
    let res: Response;
    try {
      res = await fetch(url.href, {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          // A phone browser gets the mobile menu page; Chinese first, as a local diner would.
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.5',
          Accept: accept,
        },
      });
    } catch {
      return { error: 'unreadable' };
    }
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get('location');
      res.body?.cancel().catch(() => {});
      const nextUrl: URL | null = next ? safeUrl(new URL(next, url).href) : null;
      if (!nextUrl) return { error: 'unreadable' };
      url = nextUrl;
      continue;
    }
    if (!res.ok) {
      res.body?.cancel().catch(() => {});
      return { error: 'unreadable' };
    }
    const body = await readCapped(res).catch(() => '');
    return { url, type: res.headers.get('content-type') ?? '', body };
  }
  return { error: 'unreadable' };
}

/** The menu records behind the page's data requests, labelled per address; empty when none hold Chinese text. */
async function loadedData(html: string, page: URL): Promise<string> {
  const parts: string[] = [];
  for (const url of dataUrls(html, page.href)) {
    const got = await guardedGet(url, 'application/json,text/plain;q=0.9,*/*;q=0.1');
    if ('error' in got) continue;
    let json: unknown;
    try {
      json = JSON.parse(got.body.replace(/^\s*[\w$.]+\s*\(([\s\S]*)\)\s*;?\s*$/, '$1'));
    } catch {
      continue; // Not JSON (or JSONP): an HTML page or a script, not menu data.
    }
    const data = jsonData(json);
    if (data) parts.push(`Menu data the page loads from ${url.host}${url.pathname}:\n${data}`);
  }
  return parts.join('\n\n');
}

/** Reads a scanned QR code: its text, a web page's text, or which app it needs. */
export async function readQr(raw: string): Promise<QrContent> {
  const data = raw.trim().slice(0, 2000);
  if (!/^https?:\/\//i.test(data)) return { kind: 'text', text: data };

  const first = safeUrl(data);
  if (!first) return { kind: 'unreadable', url: data, host: '' };

  const got = await guardedGet(first, 'text/html,text/plain;q=0.9,*/*;q=0.1');
  if ('error' in got) {
    return got.error === 'app'
      ? { kind: 'app', url: first.href, host: got.host, app: appOf(got.host) ?? 'an app' }
      : { kind: 'unreadable', url: first.href, host: first.hostname };
  }
  const host = got.url.hostname.toLowerCase();
  if (!/text\/html|text\/plain|application\/xhtml/i.test(got.type)) return { kind: 'unreadable', url: first.href, host };

  const isHtml = /html/i.test(got.type);
  let text = isHtml ? pageText(got.body) : got.body.trim();
  // Still no dishes: request the data the page's scripts would load.
  if (isHtml && !hasDishes(text)) {
    const loaded = await loadedData(got.body, got.url);
    if (loaded) text = `${text}\n\n${loaded}`;
  }
  // A page that says "open in WeChat" or draws everything with JavaScript has almost no Chinese text.
  if ((text.match(HAN) ?? []).length < MIN_HAN || /请在微信|微信中打开|微信客户端打开|请使用微信|支付宝中打开|请用支付宝/.test(text)) {
    return /微信/.test(text) ? { kind: 'app', url: first.href, host, app: 'WeChat' } : /支付宝/.test(text) ? { kind: 'app', url: first.href, host, app: 'Alipay' } : { kind: 'unreadable', url: first.href, host };
  }
  return { kind: 'page', url: got.url.href, host, text: text.slice(0, 16_000) };
}
