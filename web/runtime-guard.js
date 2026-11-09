'use strict';
(function (root) {
  // Wrap input simulation once per manager and release tracked buttons when focus is lost.
  function install(emulator, diagnostics) {
    const manager = emulator?.gameManager;
    if (!manager || typeof manager.simulateInput !== 'function') return null;
    if (manager.__ngInputGuard) return manager.__ngInputGuard;
    const active = new Map(),
      original = manager.simulateInput;
    const listeners = [];

    // Track pressed gameplay inputs while preserving the original receiver and return value.
    function track(player, index, value) {
      const key = player + ':' + index;
      if (index >= 0 && index < 24) {
        if (value) active.set(key, [player, index]);
        else active.delete(key);
      }
      return original.call(this, player, index, value);
    }

    // Release every tracked input, record the reason, and return the number released.
    function release(reason) {
      const pressed = Array.from(active.values());
      active.clear();
      for (const [player, index] of pressed) original.call(manager, player, index, 0);
      if (pressed.length)
        diagnostics?.event('INPUT_RELEASE_ON_FOCUS_LOSS', 'OBSERVED', {
          reason,
          released: pressed.length
        });
      return pressed.length;
    }

    // Register a listener and retain its exact reference for disposal.
    function listen(target, event, fn) {
      target?.addEventListener(event, fn);
      listeners.push([target, event, fn]);
    }
    manager.simulateInput = track;
    listen(root, 'blur', () => release('window blur'));
    listen(root, 'pagehide', () => release('page hide'));
    listen(root.document, 'visibilitychange', () => {
      if (root.document.hidden) release('document hidden');
    });

    // Release inputs only when focus moves outside the emulator container.
    listen(emulator.elements?.parent, 'focusout', event => {
      if (!emulator.elements.parent.contains(event.relatedTarget)) release('game focus left');
    });
    const guard = {
      release,

      // Release inputs, detach listeners, and restore the wrapper only if it is still installed.
      dispose() {
        release('dispose');
        for (const [target, event, fn] of listeners) target?.removeEventListener(event, fn);
        if (manager.simulateInput === track) manager.simulateInput = original;
        delete manager.__ngInputGuard;
      }
    };
    manager.__ngInputGuard = guard;
    return guard;
  }
  root.NGInputGuard = { install };
})(typeof window !== 'undefined' ? window : globalThis);
