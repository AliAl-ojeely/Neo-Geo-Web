'use strict';
(function (root) {
  let generation = 0;
  const cache = new Map();
  const bindings = new Map();
  const failures = new Map();
  const queued = [];
  let activeReads = 0;

  // Limit concurrent file reads and decodes when many cards enter the viewport together.
  function pump() {
    while (activeReads < 4 && queued.length) {
      activeReads++;
      const { task, resolve, reject } = queued.shift();
      Promise.resolve().then(task).then(resolve, reject).finally(() => {
        activeReads--;
        pump();
      });
    }
  }

  function schedule(task) {
    return new Promise((resolve, reject) => {
      queued.push({ task, resolve, reject });
      pump();
    });
  }

  const observer = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        const binding = bindings.get(entry.target);
        if (binding) load(entry.target, binding);
      }
    })
    : null;

  function error(code) {
    return Object.assign(new Error(code), { code });
  }

  // Match the requested format against file bytes, independently of OS or HTTP MIME metadata.
  async function mediaType(file, name) {
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const tag = (offset, value) => Array.from(value).every((c, i) => bytes[offset + i] === c.charCodeAt(0));
    if (/\.bmp$/i.test(name) && tag(0, 'BM')) return 'image/bmp';
    if (/\.png$/i.test(name) && bytes[0] === 137 && tag(1, 'PNG\r\n\x1a\n')) return 'image/png';
    if (/\.jpe?g$/i.test(name) && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
    if (/\.webp$/i.test(name) && tag(0, 'RIFF') && tag(8, 'WEBP')) return 'image/webp';
    throw error('INVALID_IMAGE_FORMAT');
  }

  function release(entry) {
    if (entry.users || !entry.settled) return;
    if (cache.get(entry.key) === entry) cache.delete(entry.key);
    if (entry.url) URL.revokeObjectURL(entry.url);
    entry.url = null;
  }

  function detach(img) {
    observer?.unobserve(img);
    const binding = bindings.get(img);
    if (!binding) return;
    bindings.delete(img);
    if (binding.entry) {
      binding.entry.users--;
      release(binding.entry);
    }
  }

  function acquire(key, handle) {
    if (cache.has(key)) return cache.get(key);
    const entry = { key, users: 0, url: null, settled: false };
    cache.set(key, entry);
    entry.ready = schedule(async () => {
      if (!entry.users) throw error('CANCELLED');
      let file;
      try { file = await handle.getFile(); }
      catch (e) {
        if (e.name === 'NotAllowedError' || e.name === 'SecurityError') throw error('PERMISSION_DENIED');
        if (e.name === 'NotFoundError' || e.status === 404) throw error('FILE_NOT_FOUND');
        if (e.status === 503) throw error('OFFLINE_REQUEST_BLOCKED');
        throw error('READ_FAILED');
      }
      const type = await mediaType(file, key);
      const probe = new Image();
      entry.url = URL.createObjectURL(file.slice(0, file.size, type));
      probe.src = entry.url;
      try {
        await probe.decode();
        if (!probe.naturalWidth || !probe.naturalHeight) throw error('BROWSER_DECODE_FAILED');
      } catch { throw error('BROWSER_DECODE_FAILED'); }
      finally { probe.removeAttribute('src'); }
      return entry.url;
    }).finally(() => {
      entry.settled = true;
      release(entry);
    });
    return entry;
  }

  async function load(img, binding) {
    const current = () => bindings.get(img) === binding &&
      binding.generation === generation && img.isConnected;
    if (!current() || binding.entry) return;
    try {
      const handle = root.NGLocal.maps.previews?.get(binding.name);
      if (!handle) throw error('FILE_NOT_FOUND');
      const entry = acquire(binding.name, handle);
      binding.entry = entry;
      entry.users++;
      const url = await entry.ready;
      if (!current()) return;
      img.src = url;
      img.dataset.previewStatus = 'PASS';
      failures.delete(binding.name);
    } catch (e) {
      if (!current()) return;
      const status = e.code || 'RENDERING_FAILED';
      failures.set(binding.name, status);
      img.dataset.previewStatus = status;
      detach(img);
      img.dispatchEvent(new Event('error'));
    }
  }

  // Card rebuilds can remove an image while its file read or decode is pending.
  if (typeof MutationObserver === 'function') {
    new MutationObserver(() => {
      for (const img of bindings.keys()) if (!img.isConnected) detach(img);
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  const api = {
    attach(img, name) {
      detach(img);
      img.removeAttribute('src');
      img.dataset.preview = name;
      img.dataset.previewStatus = 'PENDING';
      const binding = { name: name.toLowerCase(), generation, entry: null };
      bindings.set(img, binding);
      if (observer) observer.observe(img);
      else queueMicrotask(() => load(img, binding));
    },
    detach,
    clear() {
      generation++;
      observer?.disconnect();
      // Keep URLs owned by visible elements until the caller replaces or detaches those elements.
      for (const img of bindings.keys()) {
        if (img.dataset.previewStatus !== 'PASS') detach(img);
      }
      cache.clear();
      failures.clear();
    },
    diagnostics() { return Object.fromEntries(failures); },
    get count() { return cache.size; }
  };
  root.NGPreviews = api;
  addEventListener('pagehide', event => {
    if (event.persisted) return;
    for (const img of bindings.keys()) detach(img);
    api.clear();
  });
})(globalThis);
