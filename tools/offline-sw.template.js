/* Neo-Geo fully offline Service Worker. No ROM/BIOS data is cached here. */
'use strict';
const BUILD_ID = '__NG_OFFLINE_BUILD_ID__';
const CACHE_PREFIX = 'neogeo-static-offline-v1-';
const META_CACHE = 'neogeo-static-offline-meta-v1';
const STATE_PATH = '__neogeo_offline_state__';
const manifestPath = 'offline-manifest.json';
let busy = false;

function rootURL() {
  return new URL(self.registration.scope);
}
function stateURL() {
  return new URL(STATE_PATH, rootURL()).href;
}
async function savedState() {
  if (!(await caches.has(META_CACHE))) return null;
  const cache = await caches.open(META_CACHE);
  const response = await cache.match(stateURL());
  if (!response) return null;
  try {
    const state = await response.json();
    return state && typeof state.cacheName === 'string' && state.cacheName.startsWith(CACHE_PREFIX)
      ? state : null;
  } catch { return null; }
}
async function reportStatus() {
  const state = await savedState();
  if (!state) return { ready: false, currentBuild: BUILD_ID };
  const exists = await caches.has(state.cacheName);
  const items = exists ? await (await caches.open(state.cacheName)).keys() : [];
  const urls = new Set(items.map(item => item.url));
  const exact = Array.isArray(state.paths) && state.paths.length === state.count &&
    items.length === state.count &&
    state.paths.every(path => safePath(path) && urls.has(new URL(path, rootURL()).href));
  return {
    ready: exists && exact,
    id: state.id,
    count: state.count,
    cachedCount: items.length,
    bytes: state.bytes,
    currentBuild: BUILD_ID,
    updateAvailable: state.id !== BUILD_ID
  };
}
function safePath(path) {
  if (typeof path !== 'string' || !/^[a-zA-Z0-9_.\/-]+$/.test(path)) return false;
  if (path.startsWith('/') || path.includes('//') || path.split('/').some(x => x === '.' || x === '..')) return false;
  return !path.includes('\\');
}
function report(port, type, details = {}) {
  try { port.postMessage({ type, ...details }); } catch (_) {}
}
async function getManifest() {
  const u = new URL(manifestPath, rootURL());
  u.searchParams.set('offline_manifest_refresh', BUILD_ID);
  const response = await fetch(u, { cache: 'no-store' });
  if (!response.ok || response.type === 'opaque') throw Error('OFFLINE_MANIFEST_HTTP_' + response.status);
  const manifest = await response.json();
  if (!manifest || manifest.schema !== 1 || manifest.id !== BUILD_ID || !Array.isArray(manifest.files))
    throw Error('OFFLINE_MANIFEST_BUILD_MISMATCH: Refresh the page online.');
  if (manifest.files.length === 0 || manifest.files.length > 500) throw Error('OFFLINE_MANIFEST_FILE_COUNT');
  const paths = new Set();
  for (const item of manifest.files) {
    if (!safePath(item.path) || paths.has(item.path) ||
        !Number.isSafeInteger(item.bytes) || item.bytes < 0 ||
        !/^[a-f0-9]{64}$/.test(item.sha256)) throw Error('OFFLINE_MANIFEST_INVALID_ITEM');
    paths.add(item.path);
  }
  if (!Number.isSafeInteger(manifest.totalBytes) || manifest.totalBytes < 0 ||
      manifest.files.reduce((sum, item) => sum + item.bytes, 0) !== manifest.totalBytes)
    throw Error('OFFLINE_MANIFEST_TOTAL_BYTES_MISMATCH');
  if (!paths.has('index.html') || !paths.has('settings.html') || !paths.has('player.html') ||
      !paths.has('vendor/fbneo-selected-bios/fbneo-legacy-wasm.data') ||
      !paths.has('vendor/emulatorjs/data/loader.js')) throw Error('OFFLINE_MANIFEST_MISSING_CORE');
  return manifest;
}
async function sha256(buffer) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer));
  return [...bytes].map(x => x.toString(16).padStart(2, '0')).join('');
}

// A 200 HTTP header does not prove that the response body is complete or unchanged.
// Re-request only the affected asset, with a finite cap and SHA-256 verification each time.
async function fetchVerifiedAsset(url, item) {
  const MAX_ATTEMPTS = 3;
  let failure;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, { cache: 'reload', credentials: 'same-origin' });
      if (!response.ok || response.type === 'opaque') {
        const error = Error('OFFLINE_ASSET_HTTP_' + response.status + ': ' + item.path);
        if (response.status >= 400 && response.status < 500) error.noRetry = true;
        throw error;
      }
      const buffer = await response.arrayBuffer();
      const actualBytes = buffer.byteLength;
      if (actualBytes !== item.bytes) throw Error(
        'OFFLINE_ASSET_CHECKSUM_MISMATCH: ' + item.path +
        ' SIZE expected=' + item.bytes + ' received=' + actualBytes
      );
      const actualHash = await sha256(buffer);
      if (actualHash !== item.sha256) throw Error(
        'OFFLINE_ASSET_CHECKSUM_MISMATCH: ' + item.path +
        ' SHA256 expected=' + item.sha256 + ' received=' + actualHash
      );
      return {
        buffer,
        contentType: response.headers.get('Content-Type') || 'application/octet-stream'
      };
    } catch (error) {
      failure = error;
      if (attempt === MAX_ATTEMPTS || error.noRetry) break;
      if (typeof setTimeout === 'function')
        await new Promise(resolve => setTimeout(resolve, 200 * attempt));
    }
  }
  throw Error((failure?.message || String(failure)) + ' [attempts=' +
    (failure?.noRetry ? '1' : MAX_ATTEMPTS) + ']');
}

async function installPack(port) {
  if (busy) { report(port, 'error', { message: 'An offline download is already running.' }); return; }
  busy = true;
  let stageName;
  try {
    const manifest = await getManifest();
    const existing = await reportStatus();
    if (existing.ready && existing.id === BUILD_ID) {
      report(port, 'complete', { ...existing, alreadyInstalled: true });
      return;
    }
    // Keep the active package untouched until a complete verified replacement is committed.
    const oldState = await savedState();
    for (const name of await caches.keys()) {
      if (name.startsWith(CACHE_PREFIX) && name !== oldState?.cacheName)
        await caches.delete(name);
    }
    stageName = CACHE_PREFIX + manifest.id + '-stage-' + Date.now() + '-' +
      Math.random().toString(36).slice(2);
    const storage = await caches.open(stageName);
    let bytes = 0;
    for (let i = 0; i < manifest.files.length; i++) {
      const item = manifest.files[i];
      const url = new URL(item.path, rootURL());
      if (url.origin !== rootURL().origin || !url.pathname.startsWith(rootURL().pathname))
        throw Error('OFFLINE_ASSET_OUTSIDE_SCOPE');
      // Retry transient body/transport corruption, but never accept an unverified byte.
      // Include expected/actual sizes and hashes in the final error for offline diagnosis.
      const verified = await fetchVerifiedAsset(url, item);
      await storage.put(url.href, new Response(verified.buffer, {
        status: 200,
        headers: { 'Content-Type': verified.contentType }
      }));
      bytes += verified.buffer.byteLength;
      report(port, 'progress', {
        completed: i + 1,
        total: manifest.files.length,
        bytes,
        totalBytes: manifest.totalBytes,
        file: item.path
      });
    }
    const meta = await caches.open(META_CACHE);
    const record = {
      cacheName: stageName,
      id: manifest.id,
      count: manifest.files.length,
      paths: manifest.files.map(item => item.path),
      bytes,
      savedAt: new Date().toISOString()
    };
    await meta.put(stateURL(), new Response(JSON.stringify(record), {
      headers: { 'Content-Type': 'application/json' }
    }));
    const all = await caches.keys();
    for (const name of all)
      if (name.startsWith(CACHE_PREFIX) && name !== stageName) await caches.delete(name);
    report(port, 'complete', { ready: true, count: record.count, bytes, id: manifest.id });
  } catch (error) {
    if (stageName) {
      const state = await savedState();
      if (state?.cacheName !== stageName) await caches.delete(stageName);
    }
    report(port, 'error', { message: error?.message || String(error) });
  } finally { busy = false; }
}
async function deletePack(port) {
  if (busy) { report(port, 'error', { message: 'Offline installation in progress.' }); return; }
  busy = true;
  try {
    const meta = await caches.open(META_CACHE);
    await meta.delete(stateURL());
    for (const name of await caches.keys()) if (name.startsWith(CACHE_PREFIX)) await caches.delete(name);
    report(port, 'removed', { ready: false });
  } catch (error) { report(port, 'error', { message: error.message }); }
  finally { busy = false; }
}
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('message', event => {
  const port = event.ports?.[0];
  if (!port) return;
  const cmd = event.data?.command;
  const task = cmd === 'STATUS'
    ? reportStatus().then(result => report(port, 'status', result))
    : cmd === 'INSTALL' ? installPack(port)
      : cmd === 'REMOVE' ? deletePack(port)
        : Promise.resolve(report(port, 'error', { message: 'Unknown offline command.' }));
  event.waitUntil(task.catch(error => report(port, 'error', { message: error.message })));
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const target = new URL(req.url);
  const root = rootURL();
  if (!['http:', 'https:'].includes(target.protocol)) return;
  if (target.origin !== root.origin || !target.pathname.startsWith(root.pathname)) {
    // Stop unexpected application HTTP(S) traffic when the user enabled strict offline mode.
    event.respondWith((async () => {
      const state = await savedState();
      if (state && await caches.has(state.cacheName))
        return new Response('External requests are disabled in Fully Offline Emulator mode.', { status: 503 });
      return fetch(req);
    })());
    return;
  }
  // Always fetch a fresh manifest during user-requested updates, not the old cached copy.
  if (target.pathname === new URL(manifestPath, root).pathname &&
      target.searchParams.has('offline_manifest_refresh')) return;
  event.respondWith((async () => {
    const state = await savedState();
    if (state && await caches.has(state.cacheName)) {
      const cache = await caches.open(state.cacheName);
      const cachedURL = new URL(target.href);
      if (cachedURL.pathname === root.pathname) cachedURL.pathname += 'index.html';
      cachedURL.search = '';
      const hit = await cache.match(cachedURL.href);
      if (hit) return hit;
      // Never make a surprise network request when Fully Offline Emulator is enabled.
      return new Response('This asset was not included in the verified offline package.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
    return fetch(req);
  })());
});
