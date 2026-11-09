'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash, webcrypto } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'tools/offline-sw.template.js'), 'utf8');
const scope = 'https://example.invalid/Neo-Geo-Web/';
const prefix = 'neogeo-static-offline-v1-';
const metadataCache = 'neogeo-static-offline-meta-v1';
const stateURL = new URL('__neogeo_offline_state__', scope).href;

function fixture() {
  const contents = new Map([
    ['index.html', 'INDEX'], ['settings.html', 'SETTINGS'], ['player.html', 'PLAYER'],
    ['vendor/emulatorjs/data/loader.js', 'LOADER'],
    ['vendor/fbneo-selected-bios/fbneo-legacy-wasm.data', 'CORE']
  ]);
  const files = [...contents].map(([name, body]) => ({
    path: name, bytes: Buffer.byteLength(body),
    sha256: createHash('sha256').update(body).digest('hex')
  }));
  const manifest = { schema: 1, id: 'fixture-v1', files,
    totalBytes: files.reduce((sum, x) => sum + x.bytes, 0) };
  const store = new Map();
  const handlers = new Map();
  let network = true;
  let networkCalls = 0;
  const cacheAPI = {
    keys: async () => [...store.keys()],
    has: async name => store.has(name),
    delete: async name => store.delete(name),
    open: async name => {
      if (!store.has(name)) store.set(name, new Map());
      const map = store.get(name);
      return {
        keys: async () => [...map.keys()].map(url => new Request(url)),
        match: async req => map.get(String(req.url || req))?.clone(),
        put: async (req, response) => map.set(String(req.url || req), response.clone()),
        delete: async req => map.delete(String(req.url || req))
      };
    }
  };
  const fetch = async input => {
    networkCalls++;
    if (!network) throw Error('NO_NETWORK');
    const url = new URL(input.url || input);
    const name = url.pathname.slice(new URL(scope).pathname.length);
    if (name === 'offline-manifest.json') return new Response(JSON.stringify(manifest));
    return contents.has(name) ? new Response(contents.get(name)) : new Response('missing', { status: 404 });
  };
  const self = { registration: { scope }, skipWaiting: async () => {},
    clients: { claim: async () => {} }, addEventListener: (name, handler) => handlers.set(name, handler) };
  vm.runInNewContext(source.replace('__NG_OFFLINE_BUILD_ID__', manifest.id), {
    self, caches: cacheAPI, fetch, crypto: webcrypto, URL, Request, Response,
    Uint8Array, Map, Set, Promise, Date, Number, String, Error, console
  }, { filename: 'offline-sw.js' });
  async function send(command) {
    let work;
    const messages = [];
    handlers.get('message')({ data: { command },
      ports: [{ postMessage: msg => messages.push(msg) }], waitUntil: promise => work = promise });
    await work;
    return messages.at(-1);
  }
  async function get(name) {
    let response;
    handlers.get('fetch')({ request: new Request(new URL(name, scope)), respondWith: p => response = p });
    return response;
  }
  return { send, get, caches: cacheAPI, store,
    offline: () => network = false, count: () => networkCalls,
    seedOther: async () => {
      for (const name of ['other-app-cache-v1', 'neogeo-static-offline-v2-unrelated']) {
        const cache = await cacheAPI.open(name);
        await cache.put(new URL('unrelated', scope), new Response('KEEP'));
      }
    },
    seedPartial: async () => { const cache = await cacheAPI.open(prefix + 'partial'); await cache.put(new URL('index.html', scope), new Response('OLD')); },
    seedMetaOnly: async () => { await cacheAPI.open(metadataCache); },
    corruptActiveCache: async () => {
      const state = JSON.parse(await store.get(metadataCache).get(stateURL).clone().text());
      store.get(state.cacheName).delete(new URL('player.html', scope).href);
    }
  };
}

test('STATUS without consent creates no metadata or application cache', async () => {
  const w = fixture();
  assert.equal((await w.send('STATUS')).ready, false);
  assert.equal((await w.send('STATUS')).removable, false);
  assert.deepEqual([...w.store.keys()], []);
});

test('Install, Remove, reinstall works with the same service worker', async () => {
  const w = fixture();
  assert.equal((await w.send('INSTALL')).type, 'complete');
  assert.equal((await w.send('STATUS')).ready, true);
  const result = await w.send('REMOVE');
  assert.equal(result.type, 'removed');
  assert.ok(result.removedCaches >= 2);
  assert.equal((await w.send('STATUS')).ready, false);
  assert.equal((await w.send('STATUS')).removable, false);
  assert.deepEqual([...w.store.keys()], []);
  assert.equal((await w.send('INSTALL')).type, 'complete');
  assert.equal((await w.send('STATUS')).ready, true);
});

test('Remove deletes offline-owned caches but never unrelated browser caches', async () => {
  const w = fixture();
  await w.seedOther();
  assert.equal((await w.send('INSTALL')).type, 'complete');
  assert.equal((await w.send('REMOVE')).type, 'removed');
  assert.deepEqual([...w.store.keys()].sort(), ['neogeo-static-offline-v2-unrelated','other-app-cache-v1']);
  for (const cache of w.store.values()) assert.equal(cache.size, 1);
});

test('Remove cleans incomplete offline cache even without valid state', async () => {
  const w = fixture();
  await w.seedPartial();
  assert.equal((await w.send('STATUS')).ready, false);
  assert.equal((await w.send('STATUS')).removable, true);
  assert.equal((await w.send('REMOVE')).type, 'removed');
  assert.equal((await w.send('STATUS')).removable, false);
  assert.deepEqual([...w.store.keys()], []);
});

test('Remove cleans metadata-only leftover without touching anything else', async () => {
  const w = fixture();
  await w.seedMetaOnly();
  await w.seedOther();
  assert.equal((await w.send('STATUS')).removable, true);
  assert.equal((await w.send('REMOVE')).type, 'removed');
  assert.deepEqual([...w.store.keys()].sort(), ['neogeo-static-offline-v2-unrelated','other-app-cache-v1']);
});

test('Remove repairs package with missing cached file', async () => {
  const w = fixture();
  assert.equal((await w.send('INSTALL')).type, 'complete');
  await w.corruptActiveCache();
  const broken = await w.send('STATUS');
  assert.equal(broken.ready, false);
  assert.equal(broken.removable, true);
  assert.equal((await w.send('REMOVE')).type, 'removed');
  assert.equal((await w.send('STATUS')).removable, false);
});

test('when offline and uninstalled, the worker does not pretend files are cached', async () => {
  const w = fixture();
  assert.equal((await w.send('INSTALL')).type, 'complete');
  w.offline();
  assert.equal((await w.send('REMOVE')).type, 'removed');
  await assert.rejects(w.get('index.html'), /NO_NETWORK/);
});

test('UI and locale strings include clear bilingual Install/Update/Remove controls', () => {
  const language = fs.readFileSync(path.join(root, 'web/languages.js'), 'utf8');
  const ui = fs.readFileSync(path.join(root, 'web/offline/offline-ui.js'), 'utf8');
  const settings = fs.readFileSync(path.join(root, 'web/settings.js'), 'utf8');
  for (const token of [
    'button: { en: "Install", ar: "تثبيت" }',
    'update_button: { en: "Update", ar: "تحديث" }',
    'remove_button: { en: "Remove", ar: "إزالة" }',
    'remove_scope:', 'remove_success_note:', 'cleanup_available:'
  ]) assert.ok(language.includes(token), token);
  assert.match(settings, /data-i18n-text="offline\.remove_scope"/);
  assert.match(ui, /latest\?\.removable/);
  assert.match(ui, /message\('removed'/);
  assert.match(ui, /command\(reg, 'REMOVE'\)/);
});

test('UI transitions Update -> Remove -> Install after the user confirms deletion', async () => {
  const { MessageChannel } = require('node:worker_threads');
  const elements = {};
  for (const id of ['ng-offline-action', 'ng-offline-remove', 'ng-offline-status', 'ng-offline-progress', 'ng-offline-detail', 'ng-offline-storage-site']) {
    elements[id] = { hidden: id === 'ng-offline-remove', disabled: false, textContent: '', dataset: {}, value: 0 };
  }
  const handlers = new Map();
  const document = { getElementById: id => elements[id] || null,
    addEventListener: (event, handler) => handlers.set(event, handler) };
  let installed = true;
  const commands = [];
  const active = { postMessage: (message, ports) => {
    commands.push(message.command);
    const port = ports[0];
    const result = message.command === 'STATUS'
      ? { type: 'status', ready: installed, removable: installed, count: installed ? 67 : 0, bytes: 100 }
      : message.command === 'REMOVE'
        ? { type: 'removed', ready: false, removable: false, removedCaches: 2 }
        : { type: 'error', message: 'unexpected' };
    if (message.command === 'REMOVE') installed = false;
    port.postMessage(result);
    port.close();
  }};
  const registration = { active };
  let confirmed = 0;
  const t = k => ({
    'offline.button': 'Install', 'offline.update_button': 'Update',
    'offline.remove_button': 'Remove', 'offline.removed': 'Offline package removed',
    'offline.remove_success_note': 'Other site data are unchanged.'
  })[k] || k;
  const context = {
    document, navigator: { serviceWorker: { getRegistration: async () => registration } },
    location: new URL(scope), NG_BASE: new URL(scope), NG_STATIC: true,
    NGI18n: { t }, NGDialog: { confirm: async () => { confirmed++; return true; } },
    URL, MessageChannel, setTimeout, clearTimeout, console
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'web/offline/offline-ui.js'), 'utf8'), context);
  await context.NGOfflineUI.mount();
  assert.equal(elements['ng-offline-action'].textContent, 'Update');
  assert.equal(elements['ng-offline-remove'].hidden, false);
  await elements['ng-offline-remove'].onclick();
  assert.equal(confirmed, 1);
  assert.ok(commands.includes('REMOVE'));
  assert.equal(elements['ng-offline-action'].textContent, 'Install');
  assert.equal(elements['ng-offline-remove'].hidden, true);
  assert.match(elements['ng-offline-status'].textContent, /Offline package removed/);
});
