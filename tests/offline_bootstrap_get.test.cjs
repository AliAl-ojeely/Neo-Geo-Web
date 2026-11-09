'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const root = path.resolve(__dirname, '..');
const player = fs.readFileSync(path.join(root, 'web/player.js'), 'utf8').replace(/\r\n/g, '\n');
const worker = fs.readFileSync(path.join(root, 'tools/offline-sw.template.js'), 'utf8');
const begin = "    for (const asset of ['fbneo-legacy-wasm.data', 'fbneo.json']) {";
const blockStart = player.indexOf(begin);
assert.notEqual(blockStart, -1, 'Selected BIOS preflight must be present');
const blockEnd = player.indexOf("\n    diag.event('PREFLIGHT_PASS'", blockStart);
assert.ok(blockEnd > blockStart, 'Expected preflight end marker');
const block = player.slice(blockStart, blockEnd);
const run = new AsyncFunction('window', 'fetch', 'resource', block);

// An offline cache has only verified GET responses. The player preflight must use GET.
test('static player preflight works with GET-only offline assets', async () => {
  const requests = [];
  const fakeOfflineCache = async (url, options) => {
    requests.push({url, method: options.method});
    if (options.method === 'HEAD') throw TypeError('Failed to fetch');
    assert.equal(options.cache, 'no-store');
    return {ok: true, status: 200};
  };
  await run({NG_STATIC: true}, fakeOfflineCache, uri => 'https://example.invalid/Neo-Geo-Web/' + uri.replace(/^\//, ''));
  assert.equal(requests.length, 2);
  assert.ok(requests.every(request => request.method === 'GET'));
  assert.match(requests[0].url, /fbneo-legacy-wasm\.data$/);
  assert.match(requests[1].url, /fbneo\.json$/);
});

// Keep the existing HEAD behavior on the Python/API-backed development branch.
test('server-backed player preflight keeps HEAD probes', async () => {
  const methods = [];
  await run({NG_STATIC: false}, async (_url, options) => {
    methods.push(options.method);
    return {ok: true, status: 200};
  }, uri => uri);
  assert.deepEqual(methods, ['HEAD', 'HEAD']);
});

// Failed verification must remain a hard failure; do not bypass missing core assets.
test('cached missing core asset still fails preflight', async () => {
  await assert.rejects(() => run({NG_STATIC: true}, async () => ({ok: false, status: 503}), uri => uri), /Selected-BIOS core asset missing/);
});

// Protect the regression: install package uses GET, worker intentionally intercepts GET.
test('service worker continues to serve GET without relying on HEAD', () => {
  assert.match(worker, /req\.method\s*!==\s*['"]GET['"]/);
  assert.match(block, /window\.NG_STATIC\s*\?\s*['"]GET['"]\s*:\s*['"]HEAD['"]/);
});
