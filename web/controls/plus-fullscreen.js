/* Player-only '+' fullscreen shortcut; delegates to EmulatorJS's existing control. */
'use strict';
(function (root) {
  let enabled = false;
  let held = false;

  // Do not capture editing shortcuts, browser zoom, or keys used by emulator menus.
  function blocked(event) {
    if (event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return true;
    if (root.document.body?.classList?.contains('ng-dialog-active')) return true;
    if (event.target?.closest?.('input,textarea,select,[contenteditable="true"],[role="dialog"]'))
      return true;
    const em = root.EJS_emulator;
    if (!em || !em.started || typeof em.toggleFullscreen !== 'function') return true;
    try {
      if (em.settingsMenuOpen || em.settingsMenu?.style?.display === '') return true;
      if (typeof em.isPopupOpen === 'function' && em.isPopupOpen()) return true;
      if (em.controlPopup?.parentElement?.parentElement?.getAttribute?.('hidden') === null)
        return true;
    } catch { return true; }
    return false;
  }

  function isPlus(event) {
    return event.key === '+' || event.code === 'NumpadAdd' || event.keyCode === 107;
  }

  function keydown(event) {
    if (!enabled || !isPlus(event) || blocked(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (held || event.repeat) return;
    held = true;
    if (root.document.fullscreenElement) return;
    try {
      // The native fullscreen request stays inside a real user keydown event.
      const result = root.EJS_emulator.toggleFullscreen(true);
      if (result && typeof result.catch === 'function') result.catch(console.error);
    } catch (error) { console.error('NeoGeo fullscreen shortcut failed', error); }
  }

  function keyup(event) {
    if (!isPlus(event)) return;
    held = false;
    if (enabled && !blocked(event)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  root.addEventListener('keydown', keydown, true);
  root.addEventListener('keyup', keyup, true);
  root.addEventListener('blur', () => { held = false; });
  root.addEventListener('pagehide', () => { enabled = false; held = false; });
  root.NGPlusFullscreen = Object.freeze({
    enable() { enabled = true; held = false; },
    disable() { enabled = false; held = false; }
  });
})(window);
