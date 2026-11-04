/// <reference types="node" />
// Unit tests for reading a table QR code safely (no network: blocked and app links never fetch). Run: npm run test:chat
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dataUrls, hasDishes, htmlText, jsonData, MENU_WORDS, pageText, readQr, safeUrl } from './qr-page.ts';


test('safeUrl blocks private and odd targets', () => {
  for (const u of ['http://127.0.0.1/', 'http://[::1]/', 'http://localhost/', 'http://10.0.0.5/', 'http://2130706433/', 'http://0x7f.1/', 'file:///etc/passwd', 'http://a.com:8080/', 'http://user:pw@a.com/', 'http://router.lan/', 'http://intranet/'])
    assert.equal(safeUrl(u), null, u);
  assert.ok(safeUrl('https://menu.example.com/t/12'));
});

test('htmlText keeps visible text only', () => {
  const text = htmlText('<html><head><title>x</title></head><body><script>var a="牛肉"</script><div>牛肉面 &yen;22</div><p>红烧肉&nbsp;¥38</p></body></html>');
  assert.equal(text, '牛肉面 ¥22\n红烧肉 ¥38');
});

test('readQr: plain text and app links need no fetch', async () => {
  assert.deepEqual(await readQr('WIFI:S:shop;P:123;;'), { kind: 'text', text: 'WIFI:S:shop;P:123;;' });
  assert.equal((await readQr('https://wxaurl.cn/abc')).kind, 'app');
  assert.equal(((await readQr('https://qr.alipay.com/x')) as { app: string }).app, 'Alipay');
  assert.equal((await readQr('http://192.168.1.1/admin')).kind, 'unreadable');
});


test('pageText adds script data when the visible menu has no prices', () => {
  const html = `<html><body><header><h1>福满楼</h1><p>欢迎光临 · 请向服务员点餐</p></header><main id="menu"></main>
<footer>价格均为人民币（元）如有食物过敏，请告知服务员</footer>
<script src="https://cdn.example.com/x.js"></script>
<script>
  // ===== 在这里修改你的菜单 =====
  const MENU = [
    { category: "招牌菜", items: [
      { name: "北京烤鸭", desc: "皮脆肉嫩", price: 128, tag: "招牌" },
      { name: "宫保鸡丁", desc: "鸡丁、花生", price: 42, spicy: true },
    ]},
  ];
  document.title = "x";
</script></body></html>`;
  const text = pageText(html);
  assert.match(text, /福满楼/);
  assert.match(text, /Menu data inside the page's scripts/);
  assert.match(text, /\{ name: "北京烤鸭", desc: "皮脆肉嫩", price: 128, tag: "招牌" \}/);
  assert.doesNotMatch(text, /在这里修改/);
  assert.doesNotMatch(text, /document\.title/);
});

test('pageText leaves a page that already shows prices alone', () => {
  const html = '<div>牛肉面 ¥22</div><div>红烧肉 ¥38</div><div>米饭 3元</div><script>var a = { name: "隐藏" }</script>';
  assert.equal(pageText(html), '牛肉面 ¥22\n红烧肉 ¥38\n米饭 3元');
});

test('dataUrls finds the addresses a page loads its menu from', () => {
  const html = `<script src="/static/app.js"></script><script>
    fetch('/api/menu?shop=7').then(r => r.json());
    axios.get("https://data.example.com/v1/dishes");
    xhr.open('GET', 'menu.json');
    $.ajax({ url: "/goods/list" });
    const img = "/img/duck.png";
    fetch(\`/api/menu/\${table}\`);
    fetch('http://127.0.0.1/admin');
  </script>`;
  const urls = dataUrls(html, 'https://shop.example.com/t/5').map((u) => u.href);
  assert.deepEqual(urls, [
    'https://shop.example.com/api/menu?shop=7',
    'https://data.example.com/v1/dishes',
    'https://shop.example.com/t/menu.json',
  ]);
});

test('jsonData keeps the Chinese records with their short fields', () => {
  const data = jsonData({ code: 0, data: { list: [
    { id: 1, name: '北京烤鸭', price: 128, img: 'https://x/duck.png', desc: '皮脆肉嫩' },
    { id: 2, name: 'Cola', price: 8 },
    { id: 3, name: '宫保鸡丁', price: 42, spicy: true },
  ] } });
  assert.equal(data, 'id: 1 · name: 北京烤鸭 · price: 128 · desc: 皮脆肉嫩\nid: 3 · name: 宫保鸡丁 · price: 42');
});

test('hasDishes and MENU_WORDS', () => {
  assert.equal(hasDishes('福满楼\n欢迎光临 · 请向服务员点餐'), false);
  assert.equal(hasDishes('北京烤鸭 128\n宫保鸡丁 42\n米饭 3'), true);
  assert.ok(MENU_WORDS.test('扫码点餐'));
  assert.ok(!MENU_WORDS.test('欢迎光临本店 Wi-Fi 密码'));
});

/** Answers fetch() from a fake web: path → [content type, body]. */
function fakeWeb(pages: Record<string, [string, string]>) {
  const real = globalThis.fetch;
  const asked: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    asked.push(url);
    const page = pages[url];
    return page ? new Response(page[1], { status: 200, headers: { 'content-type': page[0] } }) : new Response('nope', { status: 404 });
  }) as typeof fetch;
  return { asked, restore: () => (globalThis.fetch = real) };
}

test('readQr follows the request a page loads its menu from', async () => {
  const web = fakeWeb({
    'https://menu.example.com/t/5': ['text/html', `<h1>福满楼</h1><p>欢迎光临 · 扫码点餐</p><div id="app"></div>
      <script>fetch('/api/menu?table=5').then(r => r.json()).then(draw)</script>`],
    'https://menu.example.com/api/menu?table=5': ['application/json', JSON.stringify({ items: [
      { name: '北京烤鸭', price: 128 }, { name: '宫保鸡丁', price: 42 }, { name: '麻婆豆腐', price: 28 },
    ] })],
  });
  try {
    const found = await readQr('https://menu.example.com/t/5');
    assert.equal(found.kind, 'page');
    const text = (found as { text: string }).text;
    assert.match(text, /Menu data the page loads from menu\.example\.com\/api\/menu:/);
    assert.match(text, /name: 北京烤鸭 · price: 128/);
    assert.match(text, /name: 麻婆豆腐 · price: 28/);
  } finally {
    web.restore();
  }
});

test('readQr: a bundled app page yields no dishes, and its script is never fetched', async () => {
  const web = fakeWeb({
    'https://order.example.com/': ['text/html', '<title>扫码点餐</title><p>欢迎光临福满楼，请扫码点餐，祝您用餐愉快</p><div id="root"></div><script src="/assets/index-3f2a.js"></script>'],
  });
  try {
    const found = await readQr('https://order.example.com/');
    assert.equal(found.kind, 'page');
    assert.equal(hasDishes((found as { text: string }).text), false);
    assert.ok(MENU_WORDS.test((found as { text: string }).text));
    assert.deepEqual(web.asked, ['https://order.example.com/']);
  } finally {
    web.restore();
  }
});
