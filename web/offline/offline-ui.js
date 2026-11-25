/* Fully offline UI: explicit opt-in, complete verified package, no game files copied. */
'use strict';
(function (root) {
  const t = key => NGI18n.t('offline.' + key);
  const bytes = value => (Number(value || 0) / 1048576).toFixed(2) + ' MiB';
  const base = () => root.NG_BASE || new URL('./', root.location.href);
  let installed = null;
  let published = null;
  let busy = false;
  let progress = null;
  let view = ['offline_update.checking'];

  const element = name => document.getElementById('ng-offline-' + name);
  const translate = key => NGI18n.t(key);
  const supported = () => root.NG_STATIC && root.isSecureContext && 'serviceWorker' in navigator;
  const updateAvailable = () => installed?.ready && published && installed.id !== published.id;

  function render() {
    const action = element('action');
    if (!action) return;
    const check = element('update-check');
    const remove = element('remove');
    const indicator = element('progress');
    const detail = element('detail');
    const statusLabel = element('status');
    const [key, state, reason, guidance] = view;
    action.hidden = Boolean(installed?.ready && !updateAvailable());
    action.disabled = busy || !supported();
    action.textContent = updateAvailable() ? translate('offline_update.update_button') : t('button');
    check.hidden = !installed?.ready;
    check.disabled = busy;
    remove.hidden = !(installed?.removable || installed?.ready);
    remove.disabled = busy;
    statusLabel.dataset.state = state || 'info';
    statusLabel.textContent = [translate(key), reason].filter(Boolean).join(' — ');
    const put = (name, value) => { element(name).textContent = value ?? '—'; };
    const displayed = published || (installed?.id ? installed : null);
    put('installed', installed?.id);
    put('published', published?.id);
    put('size', displayed ? bytes(displayed.totalBytes ?? displayed.bytes) : null);
    put('count', displayed?.files?.length ?? displayed?.count);
    put('verification', translate(progress ? 'offline.verifying' :
      installed?.ready ? 'offline.verified' : installed?.removable ? 'offline.verification_incomplete' : 'offline.verification_pending'));
    indicator.hidden = !progress;
    const percent = progress?.total ? Math.round(100 * progress.completed / progress.total) : 0;
    indicator.value = percent;
    detail.textContent = progress
      ? `${percent}% · ${progress.completed}/${progress.total} · ${bytes(progress.bytes)} / ${bytes(progress.totalBytes)}`
      : guidance ? translate(guidance) : '';
    detail.hidden = !detail.textContent;
  }

  function show(key, state, reason, guidance) {
    view = [key, state, reason, guidance];
    render();
  }

  function showPackage() {
    if (installed?.ready && published) {
      show(updateAvailable() ? 'offline_update.available' : 'offline_update.up_to_date', 'success');
    } else if (installed?.ready) show('offline.ready', 'success');
    else show(installed?.removable ? 'offline.cleanup_available' : 'offline.not_installed');
  }

  async function operate(task, errorKey, guidance = 'offline.retry_note') {
    if (busy || !supported()) return false;
    busy = true;
    render();
    try {
      return await task();
    } catch (error) {
      progress = null;
      const actual = await status();
      if (!actual.error) installed = actual;
      show(errorKey, 'error', error.message, guidance);
      return false;
    } finally {
      progress = null;
      busy = false;
      render();
    }
  }
  async function registration(create = false) {
    if (!root.NG_STATIC || !('serviceWorker' in navigator) ||
        !['https:', 'http:'].includes(location.protocol)) return null;
    const scope = base().href;
    const reg = create
      ? await navigator.serviceWorker.register(new URL('offline-sw.js', base()), { scope })
      : await navigator.serviceWorker.getRegistration(scope);
    if (!reg) return null;
    if (!create) return reg;
    // An older active worker cannot verify the newer manifest while its replacement is installing.
    try { await reg.update?.(); } catch (_) { /* Let the active worker report a failed network update. */ }
    const pending = reg.installing || reg.waiting || (reg.active?.state === 'activating' ? reg.active : null);
    if (pending && !['activated', 'redundant'].includes(pending.state)) {
      await new Promise((resolve, reject) => {
        const finish = () => {
          if (!['activated', 'redundant'].includes(pending.state)) return;
          clearTimeout(timer);
          pending.removeEventListener('statechange', finish);
          resolve();
        };
        const timer = setTimeout(() => {
          pending.removeEventListener('statechange', finish);
          reject(Error(t('timeout')));
        }, 15000);
        pending.addEventListener('statechange', finish);
        finish();
      });
    }
    return navigator.serviceWorker.ready;
  }
  async function command(reg, name, progress, expectedBuild) {
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
      try { worker.postMessage({ command: name, expectedBuild }, [channel.port2]); }
      catch (error) { clearTimeout(timer); channel.port1.close(); reject(error); }
    });
  }
  async function status(reg = null) {
    try {
      reg ||= await registration();
      return reg ? await command(reg, 'STATUS') : { ready: false };
    } catch (error) { return { ready: false, error: error.message }; }
  }

  async function checkNow() {
    return operate(async () => {
      show('offline_update.checking', 'busy');
      const local = await status();
      if (local.error) throw Error(local.error);
      installed = local;
      published = null;
      if (navigator.onLine === false) {
        if (installed.ready) show('offline_update.offline');
        else showPackage();
        return;
      }
      published = await root.NGOfflineUpdate.published();
      showPackage();
    }, 'offline_update.unavailable');
  }

  async function confirmInstall() {
    return operate(async () => {
      const discovered = published;
      show('offline_update.checking', 'busy');
      const manifest = await root.NGOfflineUpdate.published();
      published = manifest;
      if (installed?.ready && installed.id === manifest.id) {
        showPackage();
        return false;
      }
      if (discovered && discovered.id !== manifest.id) {
        show('offline_update.changed_retry', 'error');
        return false;
      }

      const label = installed?.ready ? translate('offline_update.update_button') : t('button');
      const explanation = [
        t('confirm_intro'),
        `${t('package_size')}: ${bytes(manifest.totalBytes)} · ${manifest.files.length} ${t('files')}`,
        t('local_files_note')
      ].join('\n\n');
      show('offline.confirming', 'busy');
      const persist = () => {
        try { navigator.storage?.persist?.().catch(() => {}); } catch (_) {}
      };
      const approved = root.NGDialog?.action
        ? await root.NGDialog.action({
          title: label, message: explanation, confirmLabel: label, cancelLabel: t('cancel'), onConfirm: persist
        })
        : root.confirm(explanation);
      if (!approved) {
        showPackage();
        return false;
      }
      if (!root.NGDialog?.action) persist();

      show('offline_update.preparing', 'busy');
      const fresh = await root.NGOfflineUpdate.published();
      published = fresh;
      if (fresh.id !== manifest.id) throw Error(translate('offline_update.changed_retry'));
      const reg = await root.NGOfflineUpdate.waitForBuild(fresh.id, registration, status);
      progress = { completed: 0, total: fresh.files.length, bytes: 0, totalBytes: fresh.totalBytes };
      show('offline.downloading', 'busy');
      const result = await command(reg, 'INSTALL', value => {
        progress = value;
        render();
      }, fresh.id);
      if (!result.ready || result.id !== fresh.id) throw Error(t('incomplete'));
      installed = { ...result, removable: true };
      progress = null;
      showPackage();
      document.dispatchEvent(new Event('ng-offline-pack-finished'));
      return true;
    }, 'offline.failed', 'offline.install_help');
  }

  async function confirmRemove() {
    return operate(async () => {
      const approved = root.NGDialog?.confirm
        ? await root.NGDialog.confirm(t('remove_explanation'), t('remove_button'))
        : root.confirm(t('remove_explanation'));
      if (!approved) return false;
      show('offline.removing', 'busy');
      const reg = await registration();
      if (!reg) throw Error(t('worker_unavailable'));
      const removed = await command(reg, 'REMOVE');
      const after = await command(reg, 'STATUS');
      if (removed.type !== 'removed' || after.ready || after.removable) throw Error(t('remove_incomplete'));
      installed = after;
      show('offline.removed', 'success', '', 'offline.remove_success_note');
      document.dispatchEvent(new Event('ng-offline-pack-changed'));
      return true;
    }, 'offline.failed', 'offline.remove_incomplete');
  }

  function mount() {
    const action = element('action');
    if (!action) return;
    element('storage-site').textContent = base().href;
    action.onclick = confirmInstall;
    element('remove').onclick = confirmRemove;
    element('update-check').onclick = checkNow;
    if (!supported()) show(root.NG_STATIC ? 'offline.unsupported' : 'offline.static_only');
    else if (installed === null && !busy) return checkNow();
    else render();
  }

  document.addEventListener('ng-language-changed', render);
  root.NGOfflineUI = { mount, status, confirmInstall };
})(globalThis);
