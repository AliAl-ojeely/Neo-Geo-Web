/* Validate the published manifest and select its active Service Worker. */
'use strict';
(function (root) {
  const tr = key => NGI18n.t('offline_update.' + key);
  const base = () => new URL(root.NG_BASE || './', root.location.href);
  function validPath(value) {
    return typeof value === 'string' && /^[a-zA-Z0-9_.\/-]+$/.test(value) &&
      !value.startsWith('/') && !value.includes('//') &&
      !value.split('/').some(part => part === '.' || part === '..');
  }
  function validate(manifest) {
    if (!manifest || manifest.schema !== 1 || !/^[a-f0-9]{16}$/.test(manifest.id || '') ||
        !Array.isArray(manifest.files) || manifest.files.length < 5 || manifest.files.length > 500 ||
        !Number.isSafeInteger(manifest.totalBytes) || manifest.totalBytes < 0) throw Error(tr('invalid_manifest'));
    const names = new Set();
    let bytes = 0;
    for (const file of manifest.files) {
      if (!file || !validPath(file.path) || names.has(file.path) ||
          !Number.isSafeInteger(file.bytes) || file.bytes < 0 ||
          !/^[a-f0-9]{64}$/.test(file.sha256 || '')) throw Error(tr('invalid_manifest'));
      names.add(file.path);
      bytes += file.bytes;
      if (!Number.isSafeInteger(bytes)) throw Error(tr('invalid_manifest'));
    }
    if (bytes !== manifest.totalBytes || !names.has('index.html') || !names.has('player.html') ||
        !names.has('settings.html') || !names.has('vendor/emulatorjs/data/loader.js') ||
        !names.has('vendor/fbneo-selected-bios/fbneo-legacy-wasm.data')) throw Error(tr('invalid_manifest'));
    return manifest;
  }
  async function published() {
    const url = new URL('offline-manifest.json', base());
    if (url.origin !== root.location.origin) throw Error(tr('unavailable'));
    // The existing offline SW bypasses cached responses only with this parameter.
    url.searchParams.set('offline_manifest_refresh', 'update-manager-' + Date.now());
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 12000) : null;
    try {
      const response = await fetch(url, {
        cache: 'no-store', credentials: 'same-origin',
        ...(controller ? { signal: controller.signal } : {})
      });
      if (!response.ok || response.type === 'opaque' || (response.url && new URL(response.url).origin !== url.origin)) throw Error('HTTP ' + response.status);
      return validate(await response.json());
    } finally { if (timer) clearTimeout(timer); }
  }
  async function waitForBuild(expected, register, status) {
    let registration = await register(true);
    if (!registration) throw Error(tr('worker_unavailable'));
    // A worker upgrade leaves the previously installed package active until INSTALL commits.
    for (let i = 0; i < 40; i++) {
      if ((await status(registration)).currentBuild === expected) return registration;
      await new Promise(resolve => setTimeout(resolve, 250));
      registration = await register();
      if (!registration) break;
    }
    throw Error(tr('worker_outdated'));
  }

  root.NGOfflineUpdate = Object.freeze({ published, waitForBuild });
})(globalThis);
