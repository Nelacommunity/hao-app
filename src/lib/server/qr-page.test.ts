/// <reference types="node" />
// Unit tests for reading a table QR code safely (no network: blocked and app links never fetch). Run: npm run test:chat
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { htmlText, readQr, safeUrl } from './qr-page.ts';


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

