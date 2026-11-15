'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../tools/offline-sw.template.js'), 'utf8');

function worker(scope, online = true, pack = true) {
  const cachePrefix = 'neogeo-static-offline-v1-';
  const cacheName = cachePrefix + 'old-fixture';
  const metaName = 'neogeo-static-offline-meta-v1';
  const metaURL = new URL('__neogeo_offline_state__', scope).href;
  const staleURL = new URL('settings.html', scope).href;
  const stores = new Map();
  if (pack) {
    stores.set(metaName, new Map([[metaURL, new Response(JSON.stringify({ cacheName }))]]));
    stores.set(cacheName, new Map([[staleURL, new Response('STALE-CACHED-SETTINGS')]]));
  }
  const caches = {
    has: async name => stores.has(name),
    keys: async () => [...stores.keys()],
    open: async name => {
      const map = stores.get(name) || new Map();
      return { match: async req => map.get(String(req.url || req))?.clone() || null };
    }
  };
  const callbacks = new Map();
  const self = {
    registration: { scope },
    addEventListener: (name, fn) => callbacks.set(name, fn),
    skipWaiting: async () => {}, clients: { claim: async () => {} }
  };
  let requests = 0;
  const fetch = async request => {
    requests++;
    if (!online) throw new Error('OFFLINE');
    return new Response('LATEST-BUILT-SETTINGS');
  };
  vm.runInNewContext(source, { self, caches, fetch, URL, Response, Request, Promise, Date, JSON, Error });
  async function get() {
    let responsePromise;
    callbacks.get('fetch')({
      request: new Request(new URL('settings.html?v=1.4.5', scope)),
      respondWith: promise => { responsePromise = promise; }
    });
    assert.ok(responsePromise, 'service worker intercepted the scoped HTML');
    const response = await responsePromise;
    return { body: await response.text(), status: response.status };
  }
  return { get, requestCount: () => requests, stores };
}

test('loopback preview bypasses an installed stale offline package when server is reachable', async () => {
  const fixture = worker('http://127.0.0.1:8788/Neo-Geo-Web/');
  assert.equal((await fixture.get()).body, 'LATEST-BUILT-SETTINGS');
  assert.equal(fixture.requestCount(), 1);
});

test('loopback preview falls back to previously consented offline files when server is offline', async () => {
  const fixture = worker('http://localhost:8788/', false);
  assert.equal((await fixture.get()).body, 'STALE-CACHED-SETTINGS');
  assert.equal(fixture.requestCount(), 1);
  assert.equal(fixture.stores.size, 2); // A GET does not create, delete or overwrite caches.
});

test('published site remains strict offline cache-first without a surprise network request', async () => {
  const fixture = worker('https://example.invalid/Neo-Geo-Web/');
  assert.equal((await fixture.get()).body, 'STALE-CACHED-SETTINGS');
  assert.equal(fixture.requestCount(), 0);
});

test('without consent localhost does not create cache entries just to load a live page', async () => {
  const fixture = worker('http://127.0.0.1:8788/', true, false);
  assert.equal((await fixture.get()).body, 'LATEST-BUILT-SETTINGS');
  assert.equal(fixture.stores.size, 0);
});
