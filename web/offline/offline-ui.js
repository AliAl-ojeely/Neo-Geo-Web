/* Fully offline UI: explicit opt-in, complete verified package, no game files copied. */
'use strict';
(function (root) {
  const t = key => NGI18n.t('offline.' + key);
  const bytes = value => (Number(value || 0) / 1048576).toFixed(2) + ' MiB';
  const base = () => root.NG_BASE || new URL('./', root.location.href);
  let installing = false;
  let latest = null;

  function elements() {
    return {
      action: document.getElementById('ng-offline-action'),
      remove: document.getElementById('ng-offline-remove'),
      status: document.getElementById('ng-offline-status'),
      progress: document.getElementById('ng-offline-progress'),
      detail: document.getElementById('ng-offline-detail')
    };
  }
  function message(key, detail = '', state = '') {
    const ui = elements();
    if (!ui.status) return;
    ui.status.textContent = t(key) + (detail ? ' — ' + detail : '');
    ui.status.dataset.state = state;
  }
  function updateControls(status = null) {
    const ui = elements();
    if (!ui.action) return;
    if (status) latest = status;
    ui.action.disabled = installing;
    ui.remove.hidden = !(latest?.ready || latest?.removable) || installing;
    ui.action.textContent = latest?.ready ? t('update_button') : t('button');
  }
  async function registration(create = false) {
    if (!root.NG_STATIC || !('serviceWorker' in navigator) ||
        !['https:', 'http:'].includes(location.protocol)) return null;
    const scope = base().href;
    const reg = create
      ? await navigator.serviceWorker.register(new URL('offline-sw.js', base()), { scope })
      : await navigator.serviceWorker.getRegistration(scope);
    if (!reg) return null;
    if (create) return navigator.serviceWorker.ready;
    return reg;
  }
  async function command(reg, name, progress) {
    const worker = reg.active || reg.waiting || reg.installing;
    if (!worker) throw Error(t('worker_unavailable'));
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => {
        channel.port1.close();
        reject(Error(t('timeout')));
      }, 8 * 60 * 1000);
      channel.port1.onmessage = event => {
        const data = event.data || {};
        if (data.type === 'progress') {
          progress?.(data);
          return;
        }
        clearTimeout(timer);
        channel.port1.close();
        if (data.type === 'error') reject(Error(data.message || 'Offline operation failed'));
        else resolve(data);
      };
      try { worker.postMessage({ command: name }, [channel.port2]); }
      catch (error) { clearTimeout(timer); reject(error); }
    });
  }
  async function status() {
    try {
      const reg = await registration();
      if (!reg) return { ready: false };
      return await command(reg, 'STATUS');
    } catch (error) { return { ready: false, error: error.message }; }
  }
  function category(path) {
    if (path.startsWith('vendor/fbneo-selected-bios/')) return t('category_fbneo');
    if (path.startsWith('vendor/emulatorjs/')) return t('category_emulatorjs');
    if (path.startsWith('assets/')) return t('category_assets');
    if (path.endsWith('.html')) return t('category_pages');
    return t('category_other');
  }
  function manifestSummary(manifest) {
    const map = new Map();
    for (const file of manifest.files || []) {
      const key = category(file.path);
      const item = map.get(key) || { count: 0, bytes: 0 };
      item.count++;
      item.bytes += file.bytes;
      map.set(key, item);
    }
    return [...map.entries()].map(([name, v]) => `${name}: ${v.count} files (${bytes(v.bytes)})`).join('\n');
  }
  async function fetchManifest() {
    const u = new URL('offline-manifest.json', base());
    u.searchParams.set('offline_manifest_refresh', String(Date.now()));
    const response = await fetch(u, { cache: 'no-store' });
    if (!response.ok) throw Error('HTTP ' + response.status);
    const data = await response.json();
    if (data.schema !== 1 || !Array.isArray(data.files) || !data.id)
      throw Error(t('invalid_manifest'));
    return data;
  }
  async function runInstall() {
    if (installing) return;
    installing = true;
    updateControls();
    const ui = elements();
    if (ui.progress) {
      ui.progress.hidden = false;
      ui.progress.value = 0;
    }
    if (ui.detail) ui.detail.textContent = '';
    message('downloading', '', 'busy');
    // Persistence is a best-effort storage request, never a filesystem permission grant.
    try { navigator.storage?.persist?.().catch(() => {}); } catch (_) {}
    try {
      const reg = await registration(true);
      if (!reg) throw Error(t('unsupported'));
      const result = await command(reg, 'INSTALL', value => {
        const percent = Math.round(100 * value.completed / value.total);
        const current = elements();
        if (current.progress) current.progress.value = percent;
        if (current.detail) current.detail.textContent = `${percent}% · ${value.completed}/${value.total} · ${bytes(value.bytes)} / ${bytes(value.totalBytes)} · ${value.file}`;
      });
      latest = result;
      if (!result.ready) throw Error(t('incomplete'));
      message('ready', `${result.count} ${t('files')} · ${bytes(result.bytes)}`, 'success');
      if (ui.detail) ui.detail.textContent = t('ready_note') + ' ' + t('storage_saved') + ' ' + base().href;
    } catch (error) {
      message('failed', error.message, 'error');
      if (ui.detail) ui.detail.textContent = t('retry_note') + ' ' + t('extension_note');
    } finally {
      installing = false;
      if (ui.progress) ui.progress.hidden = true;
      updateControls();
    }
  }
  async function confirmInstall() {
    try {
      if (!root.NG_STATIC) throw Error(t('static_only'));
      if (!('serviceWorker' in navigator) || !root.isSecureContext)
        throw Error(t('unsupported'));
      const manifest = await fetchManifest();
      const explanation = [
        t('confirm_intro'),
        '',
        `${t('download_size')}: ${bytes(manifest.totalBytes)} (${manifest.files.length} ${t('files')})`,
        manifestSummary(manifest),
        '',
        'index.html · settings.html · player.html · data/catalog.json',
        'vendor/emulatorjs/data/loader.js · vendor/fbneo-selected-bios/fbneo-legacy-wasm.data',
        '',
        t('local_files_note'),
        '',
        t('storage_heading'),
        t('storage_location'),
        `${t('storage_site')} ${base().href}`,
        t('storage_scope'),
        t('storage_inspect'),
        t('storage_privacy'),
        '',
        t('permissions_note'),
        '',
        t('updates_note'),
        '',
        t('extension_note')
      ].join('\n');
      if (root.NGDialog?.action) {
        root.NGDialog.action({
          title: t('dialog_title'),
          message: explanation,
          confirmLabel: t('start_download'),
          cancelLabel: t('cancel'),
          onConfirm: runInstall
        });
      } else if (root.confirm(explanation)) await runInstall();
    } catch (error) { message('failed', error.message, 'error'); }
  }
  async function confirmRemove() {
    if (installing) return;
    const approved = root.NGDialog?.confirm
      ? await root.NGDialog.confirm(t('remove_explanation'), t('remove_button'))
      : root.confirm(t('remove_explanation'));
    if (!approved || installing) return;
    installing = true;
    updateControls();
    try {
      const reg = await registration();
      if (!reg) throw Error(t('worker_unavailable'));
      const removed = await command(reg, 'REMOVE');
      if (removed.type !== 'removed') throw Error(t('remove_incomplete'));
      const after = await command(reg, 'STATUS');
      if (after.ready || after.removable) throw Error(t('remove_incomplete'));
      latest = after;
      message('removed', '', 'success');
      const ui = elements();
      if (ui.detail) ui.detail.textContent = t('remove_success_note');
    } catch (error) { message('failed', error.message, 'error'); }
    finally { installing = false; updateControls(); }
  }
  async function mount() {
    const ui = elements();
    if (!ui.action) return;
    const storageSite = document.getElementById('ng-offline-storage-site');
    if (storageSite) storageSite.textContent = base().href;
    ui.action.onclick = confirmInstall;
    if (ui.remove) ui.remove.onclick = confirmRemove;
    if (!root.NG_STATIC) {
      ui.action.disabled = true;
      message('static_only', '', 'info');
      return;
    }
    const result = await status();
    // Ignore late responses if the user switched settings tabs or started a download.
    if (!document.getElementById('ng-offline-action') || installing) return;
    latest = result;
    if (result.ready)
      message(result.updateAvailable ? 'update_available' : 'ready',
        `${result.count} ${t('files')} · ${bytes(result.bytes)}`, 'success');
    else message(result.error ? 'failed' : result.removable ? 'cleanup_available' : 'not_installed', result.error || '', result.error ? 'error' : 'info');
    updateControls();
  }
  document.addEventListener('ng-language-changed', () => {
    if (document.getElementById('ng-offline-action')) mount();
  });
  root.NGOfflineUI = { mount, status };
})(globalThis);
