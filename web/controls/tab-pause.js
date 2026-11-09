/* NeoRAGEx-style Tab to pause / resume an active local emulator session.
 * This script does not edit EmulatorJS or intercept browser/system shortcuts.
 */
'use strict';
(function (root) {
  let enabled = false;
  let overlay;

  // Read the current EmulatorJS instance rather than retaining a stale reference.
  function emulator() {
    return root.EJS_emulator;
  }

  // Allow pause controls only after enabling them and when both emulator methods exist.
  function usable() {
    const em = emulator();
    return enabled && em && typeof em.pause === 'function' && typeof em.play === 'function';
  }

  // Show the pause overlay only while this integration is enabled and the emulator is paused.
  function status() {
    const em = emulator();
    if (!overlay || !em) return;
    overlay.hidden = !enabled || !em.paused;
  }

  // Toggle emulator pause state and refresh the overlay; report exceptions without propagating them.
  function toggle() {
    if (!usable()) return false;
    const em = emulator();
    try {
      if (em.paused) em.play();
      else em.pause();
      status();
      return true;
    } catch (e) {
      console.error('NeoGeo Tab pause failed', e);
      return false;
    }
  }

  // Intercept unmodified Tab outside editable fields; toggle only on the first keydown.
  function handleKey(e) {
    if (e.key !== 'Tab' || !usable()) return;
    // Shift+Tab remains available for accessible keyboard navigation.
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.isComposing) return;
    const target = e.target;
    if (
      target &&
      (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/i.test(target.tagName || ''))
    )
      return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.type === 'keydown' && !e.repeat) toggle();
  }
  // Capturing is needed because EmulatorJS also listens for gameplay keys.
  root.addEventListener('keydown', handleKey, true);
  root.addEventListener('keyup', handleKey, true);

  // Create one accessible pause overlay and update the stage hint when the stage exists.
  function init() {
    const stage = root.document.querySelector('.emulator-stage');
    if (!stage || root.document.getElementById('ng-tab-paused')) return;
    overlay = root.document.createElement('div');
    overlay.id = 'ng-tab-paused';
    overlay.className = 'ng-tab-paused';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    overlay.textContent = NGI18n.t('tab_pause.paused_press_tab_to_resume');
    overlay.hidden = true;
    stage.append(overlay);
    const hint = root.document.querySelector('.stage-note p');
    if (hint) hint.textContent = NGI18n.t('tab_pause.click_the_game_to_focus_controls_press');
  }
  if (root.document.readyState === 'loading')
    root.document.addEventListener('DOMContentLoaded', init);
  else init();
  root.NGTabPause = Object.freeze({
    // Enable Tab handling and synchronize the overlay without changing emulator pause state.
    enable: () => {
      enabled = true;
      status();
    },

    // Disable Tab handling and hide the overlay without resuming the emulator.
    disable: () => {
      enabled = false;
      status();
    },
    toggle,
    status
  });
})(window);
