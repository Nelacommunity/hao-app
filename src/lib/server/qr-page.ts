// What a restaurant's table QR code points at, for the menu scanner. Most Chinese ordering codes open a WeChat or
// Alipay mini program (or a page that only works inside one), which a server can't read: those come back as
// `app`, and the app asks for a screenshot instead. Plain web menus are fetched and reduced to their visible text.
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

/** Reads a scanned QR code: its text, a web page's text, or which app it needs. */
export async function readQr(raw: string): Promise<QrContent> {
  const data = raw.trim().slice(0, 2000);
  if (!/^https?:\/\//i.test(data)) return { kind: 'text', text: data };

  const first = safeUrl(data);
  if (!first) return { kind: 'unreadable', url: data, host: '' };
  let url: URL = first;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const host = url.hostname.toLowerCase();
    const app = appOf(host);
    if (app) return { kind: 'app', url: first.href, host, app };

    let res: Response;
    try {
      res = await fetch(url.href, {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          // A phone browser gets the mobile menu page; Chinese first, as a local diner would.
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.5',
          Accept: 'text/html,text/plain;q=0.9,*/*;q=0.1',
        },
      });
    } catch {
      return { kind: 'unreadable', url: first.href, host };
    }

    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get('location');
      res.body?.cancel().catch(() => {});
      const nextUrl: URL | null = next ? safeUrl(new URL(next, url).href) : null;
      if (!nextUrl) return { kind: 'unreadable', url: first.href, host };
      url = nextUrl;
      continue;
    }

    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !/text\/html|text\/plain|application\/xhtml/i.test(type)) {
      res.body?.cancel().catch(() => {});
      return { kind: 'unreadable', url: first.href, host };
    }
    const body = await readCapped(res).catch(() => '');
    const text = /html/i.test(type) ? htmlText(body) : body.trim();
    // A page that says "open in WeChat" or draws everything with JavaScript has almost no Chinese text.
    if ((text.match(HAN) ?? []).length < MIN_HAN || /请在微信|微信中打开|微信客户端打开|请使用微信|支付宝中打开|请用支付宝/.test(text)) {
      return /微信/.test(text) ? { kind: 'app', url: first.href, host, app: 'WeChat' } : /支付宝/.test(text) ? { kind: 'app', url: first.href, host, app: 'Alipay' } : { kind: 'unreadable', url: first.href, host };
    }
    return { kind: 'page', url: url.href, host, text: text.slice(0, 12_000) };
  }
  return { kind: 'unreadable', url: first.href, host: first.hostname };
}
