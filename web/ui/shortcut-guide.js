/* Home-only keyboard shortcut guide using the shared modal appearance. */
'use strict';
(function (root) {
  function init() {
    const trigger = root.document.getElementById('ng-shortcuts-trigger');
    const modal = root.document.getElementById('ng-shortcuts-modal');
    if (!trigger || !modal) return;
    const closeButton = modal.querySelector('[data-shortcuts-close]');
    const backdrop = modal.querySelector('[data-shortcuts-dismiss]');
    let previousFocus = null;

    // Keep the guide independent from the initial-setup dialog and browser storage.
    function close() {
      if (modal.hidden) return;
      modal.classList.remove('is-open');
      modal.hidden = true;
      root.document.body.classList.remove('ng-shortcuts-open');
      trigger.setAttribute('aria-expanded', 'false');
      if (previousFocus?.isConnected) previousFocus.focus?.({ preventScroll: true });
      previousFocus = null;
    }

    function open() {
      if (!modal.hidden) return;
      if (!root.document.getElementById('first-run-guide')?.hidden) return;
      previousFocus = root.document.activeElement;
      modal.hidden = false;
      root.document.body.classList.add('ng-shortcuts-open');
      trigger.setAttribute('aria-expanded', 'true');
      if (typeof root.requestAnimationFrame === 'function')
        root.requestAnimationFrame(() => { if (!modal.hidden) modal.classList.add('is-open'); });
      else modal.classList.add('is-open');
      closeButton?.focus?.({ preventScroll: true });
    }

    trigger.addEventListener('click', open);
    closeButton?.addEventListener('click', close);
    backdrop?.addEventListener('click', close);
    modal.addEventListener('click', event => { if (event.target === modal) close(); });
    modal.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation?.();
        close();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusables = [...modal.querySelectorAll('button:not([disabled]), a[href]')].filter(
        element => !element.hidden && (typeof element.getClientRects !== 'function' || element.getClientRects().length > 0)
      );
      if (!focusables.length) { event.preventDefault(); return; }
      const first = focusables[0], last = focusables[focusables.length - 1];
      if (event.shiftKey && root.document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && root.document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    root.addEventListener('pagehide', close);
  }
  if (root.document.readyState === 'loading')
    root.document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})(window);
