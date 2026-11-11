/* Player-only double-Escape return to the existing library navigation. */
'use strict';
(function (root) {
  const DOUBLE_PRESS_MS = 2000;
  let enabled = false;
  let held = false;
  let firstPress = null;
  let timeout = null;
  let hint = null;
  let exiting = false;

  // Keep the prompt inside the current fullscreen element when applicable.
  function placeHint() {
    if (!hint) return;
    const host = root.document.fullscreenElement || root.document.querySelector('.emulator-stage');
    if (host && hint.parentNode !== host) host.appendChild(hint);
  }

  // Create a non-interactive, accessible prompt without changing gameplay layout.
  function ensureHint() {
    if (hint) return hint;
    const host = root.document.querySelector('.emulator-stage');
    if (!host) return null;
    hint = root.document.createElement('div');
    hint.id = 'ng-esc-exit-hint';
    hint.className = 'ng-esc-exit-hint';
    hint.setAttribute('role', 'status');
    hint.setAttribute('aria-live', 'polite');
    hint.textContent = root.NGI18n.t('player.press_esc_again_to_return_to_library');
    hint.hidden = true;
    host.appendChild(hint);
    placeHint();
    return hint;
  }

  // Clear the short double-press window and its visual hint.
  function reset() {
    if (timeout !== null) root.clearTimeout(timeout);
    timeout = null;
    firstPress = null;
    if (hint) hint.hidden = true;
  }

  // Preserve Escape for dialogs, text editing, and open EmulatorJS menus.
  function blocked(event) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing)
      return true;
    if (root.document.body?.classList?.contains('ng-dialog-active')) return true;
    if (event.target?.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"]'))
      return true;
    const em = root.EJS_emulator;
    if (!em) return false;
    try {
      if (typeof em.isPopupOpen === 'function' && em.isPopupOpen()) return true;
      const menus = [em.settingsMenu, em.controlPopup?.parentElement?.parentElement];
      for (const menu of menus) {
        if (!menu || menu.hidden || menu.closest?.('[hidden]')) continue;
        const style = root.getComputedStyle?.(menu);
        if (style && style.display !== 'none' && style.visibility !== 'hidden' &&
            typeof menu.getClientRects === 'function' && menu.getClientRects().length)
          return true;
      }
    } catch {
      // EmulatorJS may be replacing menu elements during startup/shutdown.
      return true;
    }
    return false;
  }

  // Count distinct key presses, never auto-repeat or intercepted dialog Escape.
  function onKeyDown(event) {
    if (!enabled || event.key !== 'Escape') return;
    if (blocked(event)) {
      reset();
      held = false;
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.repeat || held || exiting) return;
    held = true;
    const now = root.performance?.now?.() ?? Date.now();
    if (firstPress !== null && now - firstPress >= 0 && now - firstPress <= DOUBLE_PRESS_MS) {
      reset();
      exiting = true;
      enabled = false;
      // The existing back link also handles same-origin iframe session cleanup.
      const back = root.document.querySelector('.player-header .back-btn');
      if (back) back.click();
      else root.location.assign(new URL('./', root.NG_BASE || root.location.href).href);
      return;
    }
    reset();
    firstPress = now;
    const notice = ensureHint();
    if (notice) {
      notice.textContent = root.NGI18n.t('player.press_esc_again_to_return_to_library');
      placeHint();
      notice.hidden = false;
    }
    timeout = root.setTimeout(reset, DOUBLE_PRESS_MS);
  }

  // Requiring release avoids treating a held key as two deliberate presses.
  function onKeyUp(event) {
    if (event.key !== 'Escape') return;
    if (enabled && !blocked(event)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    held = false;
  }

  root.addEventListener('keydown', onKeyDown, true);
  root.addEventListener('keyup', onKeyUp, true);
  root.addEventListener('blur', reset);
  root.addEventListener('pagehide', () => api.disable());
  root.document.addEventListener('fullscreenchange', placeHint);
  root.document.addEventListener('ng-language-changed', () => {
    if (hint) hint.textContent = root.NGI18n.t('player.press_esc_again_to_return_to_library');
  });

  const api = Object.freeze({
    // Only activate after the game actually starts.
    enable() {
      enabled = true;
      exiting = false;
      held = false;
      reset();
    },
    // Stop intercepting Escape when play ends.
    disable() {
      enabled = false;
      exiting = false;
      held = false;
      reset();
    }
  });
  root.NGEscExit = api;
})(window);
