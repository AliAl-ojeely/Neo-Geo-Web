/* Optional offline build discovery: small manifest checks, explicit consent for downloads. */
'use strict';
(function (root) {
  const tr = key => NGI18n.t('offline_update.' + key);
  const base = () => new URL(root.NG_BASE || './', root.location.href);
  const size = value => (value / 1048576).toFixed(2) + ' MiB';
  const ids = {
    check: 'ng-offline-update-check',
    apply: 'ng-offline-update-apply',
    status: 'ng-offline-update-status',
    detail: 'ng-offline-update-detail'
  };
  let latest = null;
  let installed = null;
  let checking = false;
  let pending = false;
  let mountedButton = null;
  let lastView = 'not_installed';

  function elements() {
    return Object.fromEntries(Object.entries(ids).map(([name, id]) => [name, document.getElementById(id)]));
  }
  function show(key, details = '', mode = 'info') {
    lastView = key;
    const ui = elements();
    if (!ui.status) return;
    ui.status.textContent = tr(key);
    ui.status.dataset.state = mode;
    if (ui.detail) ui.detail.textContent = details;
    if (ui.apply) {
      ui.apply.hidden = !(installed?.ready && latest && latest.id !== installed.id);
      ui.apply.disabled = checking || pending;
    }
    if (ui.check) ui.check.disabled = checking || pending || !root.NG_STATIC;
  }
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
    return { id: manifest.id, count: manifest.files.length, totalBytes: manifest.totalBytes };
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
      if (!response.ok || response.type === 'opaque') throw Error('HTTP ' + response.status);
      return validate(await response.json());
    } finally { if (timer) clearTimeout(timer); }
  }
  function summary(cached, fresh) {
    return `${tr('installed_build')}: ${cached.id || tr('unavailable')}\n` +
      `${tr('published_build')}: ${fresh.id}\n` +
      `${tr('download_size')}: ${size(fresh.totalBytes)} · ${fresh.count} ${tr('files')}`;
  }
  async function checkNow(automatic = false) {
    if (checking) return;
    if (!root.NG_STATIC || !root.NGOfflineUI?.status) {
      show('static_only');
      return;
    }
    checking = true;
    show('checking');
    try {
      const local = await root.NGOfflineUI.status();
      installed = local;
      latest = null;
      if (!local?.ready) {
        show(local?.error ? 'unavailable' : 'not_installed', '', local?.error ? 'error' : 'info');
        return;
      }
      if (automatic && navigator.onLine === false) {
        show('offline', `${tr('installed_build')}: ${local.id}`, 'info');
        return;
      }
      const next = await published();
      latest = next;
      const differs = local.id !== next.id;
      show(differs ? 'available' : 'up_to_date', summary(local, next), differs ? 'success' : 'info');
    } catch (error) {
      latest = null;
      show('unavailable', error?.message || '', 'error');
    } finally {
      checking = false;
      const ui = elements();
      if (ui.check) ui.check.disabled = false;
      if (ui.apply) ui.apply.disabled = false;
    }
  }
  async function waitForBuild(expected) {
    // Updating only the worker script never replaces the installed offline package.
    for (let i = 0; i < 40; i++) {
      const info = await root.NGOfflineUI.status();
      if (info?.currentBuild === expected) return;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw Error(tr('worker_outdated'));
  }
  async function applyUpdate() {
    if (checking || pending || !installed?.ready || !latest || installed.id === latest.id ||
        typeof root.NGOfflineUI?.confirmInstall !== 'function') return;
    const checkedId = latest.id;
    pending = true;
    show('confirming', summary(installed, latest));
    // The existing Fully Offline confirmation remains the sole download approval gate.
    try {
      const approved = await root.NGOfflineUI.confirmInstall(async () => {
      show('preparing', '', 'busy');
      const fresh = await published();
      if (fresh.id !== checkedId) throw Error(tr('changed_retry'));
      const reg = await navigator.serviceWorker.getRegistration(base().href);
      if (!reg || typeof reg.update !== 'function') throw Error(tr('worker_unavailable'));
      await reg.update();
      await waitForBuild(checkedId);
      show('downloading', summary(installed, fresh), 'busy');
      });
      if (!approved) {
        pending = false;
        show('available', summary(installed, latest), 'success');
      }
    } catch (error) {
      pending = false;
      show('unavailable', error?.message || '', 'error');
    }
  }
  function mount() {
    const ui = elements();
    if (!ui.check) return;
    if (mountedButton === ui.check) return;
    mountedButton = ui.check;
    ui.check.onclick = () => checkNow(false);
    if (ui.apply) ui.apply.onclick = applyUpdate;
    installed = null;
    latest = null;
    if (!root.NG_STATIC) {
      ui.check.disabled = true;
      show('static_only');
      return;
    }
    // A small, uncached manifest is read only if an offline package already exists.
    checkNow(true);
  }
  document.addEventListener('ng-offline-pack-finished', () => {
    pending = false;
    if (elements().check) checkNow(false);
  });
  document.addEventListener('ng-offline-pack-changed', () => {
    if (elements().check) checkNow(false);
  });
  document.addEventListener('ng-language-changed', () => {
    if (elements().check) {
      if (latest && installed) show(lastView, summary(installed, latest));
      else show(lastView);
    }
  });
  root.NGOfflineUpdateUI = Object.freeze({ mount, check: () => checkNow(false) });
})(globalThis);
