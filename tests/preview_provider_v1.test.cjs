'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { join } = require('node:path');
const source = fs.readFileSync(join(__dirname, '../web/library/preview-provider.js'), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture() {
  const urls = new Map(), revoked = [];
  const previews = new Map();
  let next = 0, intersect, mutate, pagehide;
  class Probe {
    async decode() {
      if (urls.get(this.src).size === 13) throw Error('bad pixels');
      this.naturalWidth = this.naturalHeight = 1;
    }
    removeAttribute() {}
  }
  const sandbox = {
    Blob, Event, Uint8Array, Image: Probe, document: { documentElement: {} },
    NGLocal: { maps: { previews } },
    addEventListener: (_, callback) => { pagehide = callback; },
    URL: {
      createObjectURL(blob) { const url = 'blob:' + ++next; urls.set(url, blob); return url; },
      revokeObjectURL(url) { revoked.push(url); urls.delete(url); }
    },
    IntersectionObserver: class {
      constructor(callback) { intersect = callback; }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
    MutationObserver: class {
      constructor(callback) { mutate = callback; }
      observe() {}
    }
  };
  vm.runInNewContext(source, sandbox);
  return { api: sandbox.NGPreviews, previews, urls, revoked,
    show: (...imgs) => intersect(imgs.map(target => ({ target, isIntersecting: true }))),
    mutate: () => mutate(), hide: persisted => pagehide({ persisted }) };
}

function image() {
  return { dataset: {}, isConnected: true, errors: 0,
    removeAttribute() { delete this.src; },
    dispatchEvent() { this.errors++; } };
}

test('lazy previews verify signatures and normalize BMP, PNG, JPEG and WebP MIME', async () => {
  const f = fixture();
  for (const [ext, signature, mime] of [
    ['bmp', '424d', 'image/bmp'],
    ['png', '89504e470d0a1a0a', 'image/png'],
    ['jpeg', 'ffd8ff', 'image/jpeg'],
    ['webp', '524946460000000057454250', 'image/webp']
  ]) {
    const img = image();
    f.previews.set('a.' + ext, { getFile: async () => new Blob([Buffer.from(signature, 'hex')], {type:'application/octet-stream'}) });
    f.api.attach(img, 'A.' + ext.toUpperCase());
    await flush();
    assert.equal(img.src, undefined);
    f.show(img);
    await flush();
    assert.equal(f.urls.get(img.src).type, mime);
    assert.equal(img.dataset.previewStatus, 'PASS');
  }
});

test('missing, malformed, corrupt and denied reads preserve separate diagnostics', async () => {
  const f = fixture();
  f.previews.set('wrong.bmp', { getFile: async () => new Blob(['unrelated']) });
  f.previews.set('broken.bmp', { getFile: async () => new Blob(['BM12345678901']) });
  f.previews.set('permission.bmp', { getFile: async () => { throw { name: 'NotAllowedError' }; } });
  f.previews.set('offline.bmp', { getFile: async () => { throw { status: 503 }; } });
  for (const [name, code] of Object.entries({ 'wrong.bmp':'INVALID_IMAGE_FORMAT',
    'broken.bmp':'BROWSER_DECODE_FAILED', 'gone.bmp':'FILE_NOT_FOUND',
    'permission.bmp':'PERMISSION_DENIED', 'offline.bmp':'OFFLINE_REQUEST_BLOCKED' })) {
    const img = image();
    f.api.attach(img, name);
    f.show(img);
    await flush();
    assert.equal(img.dataset.previewStatus, code);
    assert.equal(f.api.diagnostics()[name], code);
    assert.equal(img.errors, 1);
  }
  assert.equal(f.urls.size, 0);
});

test('concurrent consumers share a URL until the last connected consumer is removed', async () => {
  const f = fixture();
  const a = image(), b = image();
  let reads = 0;
  f.previews.set('a.bmp', { getFile: async () => { reads++; return new Blob(['BM']); } });
  for (const img of [a,b]) f.api.attach(img, 'a.bmp');
  f.show(a,b);
  await flush();
  assert.equal(reads, 1);
  assert.equal(a.src, b.src);
  f.hide(true);
  f.api.clear();
  a.isConnected = false;
  f.mutate();
  assert.equal(f.urls.size, 1);
  b.isConnected = false;
  f.mutate();
  assert.deepEqual(f.revoked, [a.src]);
});

test('a pending request from an old source cannot replace a newer render or dispatch an error', async () => {
  const f = fixture();
  const img = image();
  let reject;
  f.previews.set('a.bmp', { getFile: () => new Promise((_, fail) => { reject = fail; }) });
  f.api.attach(img, 'a.bmp');
  f.show(img);
  await flush();
  f.api.clear();
  f.previews.set('a.bmp', { getFile: async () => new Blob(['BM']) });
  f.api.attach(img, 'a.bmp');
  f.show(img);
  await flush();
  const current = img.src;
  reject(Error('old request failed'));
  await flush();
  assert.equal(img.src, current);
  assert.equal(img.errors, 0);
  assert.equal(img.dataset.previewStatus, 'PASS');
  f.hide(false);
  assert.equal(f.urls.size, 0);
});
