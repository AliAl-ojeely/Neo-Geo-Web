/* Neo-Geo Web Emu: versioned, local-only frontend preferences (no remote calls). */
(function () {
  'use strict';
  const KEY = 'ng-webemu-settings-v012';
  const DEFAULTS = Object.freeze({
    language: 'en-US',
    volume: 70,
    scale: 'fit',
    pixelated: true,
    scanlines: false,
    crt: false,
    autoStart: false,
    fullscreen: false,
    askBeforeExit: false,
    diagnostics: true,
    loadMoreGames: true,
    performanceMonitor: false,
    performanceHudSize: 'full',
    performanceHudPosition: 'top-right'
  });

  // Merge supported preference values into defaults and clamp the volume range.
  function sanitize(raw) {
    const p = { ...DEFAULTS };
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return p;
    if (['ar-AR', 'en-US'].includes(raw.language)) p.language = raw.language;
    if (Number.isFinite(raw.volume))
      p.volume = Math.max(0, Math.min(100, Math.round(raw.volume)));
    if (['fit', '4:3', 'original'].includes(raw.scale)) p.scale = raw.scale;
    for (const key of [
      'pixelated',
      'scanlines',
      'crt',
      'autoStart',
      'fullscreen',
      'askBeforeExit',
      'diagnostics',
      'loadMoreGames',
      'performanceMonitor'
    ]) {
      if (typeof raw[key] === 'boolean') p[key] = raw[key];
    }
    if (['full', 'medium', 'small'].includes(raw.performanceHudSize))
      p.performanceHudSize = raw.performanceHudSize;
    if (['top-left', 'top-center', 'top-right', 'middle-left', 'middle-right',
      'bottom-left', 'bottom-center', 'bottom-right'].includes(raw.performanceHudPosition))
      p.performanceHudPosition = raw.performanceHudPosition;
    return p;
  }

  // Read sanitized preferences, returning defaults if storage or JSON parsing fails.
  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
      const prefs = sanitize(raw);
      if (!['ar-AR', 'en-US'].includes(raw?.language))
        prefs.language = NGI18n.getLanguage() === 'ar' ? 'ar-AR' : 'en-US';
      return prefs;
    } catch (_) {
      return sanitize();
    }
  }

  // Persist sanitized preferences and report whether the storage write succeeded.
  function save(p) {
    try {
      localStorage.setItem(KEY, JSON.stringify(sanitize(p)));
      return true;
    } catch (_) {
      return false;
    }
  }
  window.NGPrefs = Object.freeze({ KEY, DEFAULTS, sanitize, load, save });
})();
