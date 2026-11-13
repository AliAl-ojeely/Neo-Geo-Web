/* Three-second library entry splash; page initialization continues underneath. */
'use strict';
(function (root) {
  const document = root.document;
  const html = document.documentElement;
  const SEEN_KEY = 'neogeo-startup-loading-seen-v1';
  const DURATION_MS = 3000;

  // Skip repeat navigation in the same tab, including returning from a game.
  try {
    if (root.sessionStorage.getItem(SEEN_KEY) === '1') return;
    root.sessionStorage.setItem(SEEN_KEY, '1');
  } catch {
    // Storage may be blocked; the splash still works without persistence.
  }

  // Enable the cover before the body is parsed to avoid flashing the library.
  html.classList.add('ng-startup-pending');
  html.setAttribute('aria-busy', 'true');
  let completed = false;

  // Reveal already-initializing content after the fixed visual delay.
  function finish() {
    if (completed) return;
    completed = true;
    html.classList.remove('ng-startup-pending');
    html.removeAttribute('aria-busy');
    const screen = document.getElementById('ng-startup-screen');
    if (screen) screen.hidden = true;
    if (typeof document.dispatchEvent === 'function' && typeof Event === 'function')
      document.dispatchEvent(new Event('ng-startup-finished'));
  }

  // Deferred site scripts run before DOMContentLoaded; they are never delayed by the splash.
  function start() {
    root.setTimeout(finish, DURATION_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
  root.addEventListener('pagehide', finish, { once: true });
})(window);
