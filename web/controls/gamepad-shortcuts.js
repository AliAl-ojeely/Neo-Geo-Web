/* Gamepad shortcuts v1.4.1: optional, player-one controller commands without synthetic input. */
'use strict';
(function (root) {
  const KEY = 'ng-gamepad-shortcuts-v1';
  const ACTIONS = Object.freeze(['pause', 'fullscreen', 'library', 'mute', 'restart', 'controls']);
  const DANGEROUS = new Set(['library', 'restart']);
  const DOUBLE_MS = 2000;
  const CAPTURE_MS = 8000;
  const $ = id => root.document.getElementById(id);
  const t = key => root.NGI18n?.t?.('gamepad_shortcuts.' + key) || key;
  let emulator = null;
  let gameTimer = null;
  let settingsTimer = null;
  let settingsFrame = null;
  let capture = null;
  let lastKeys = '';
  let lastPad = '';
  let confirmAction = null;
  let confirmAt = 0;
  let toast = null;
  let toastTimer = null;
  let activeBindings = null;

  const defaults = () => ({ schema: 1, bindings: Object.fromEntries(ACTIONS.map(a => [a, []])) });
  const code = b => b.join('+');
  function validButtons(value) {
    if (!Array.isArray(value) || value.length < 1 || value.length > 2 ||
        value.some(n => !Number.isInteger(n) || n < 0 || n > 31) ||
        new Set(value).size !== value.length) return [];
    return value.slice().sort((a, b) => a - b);
  }
  function conflict(a, b) {
    if (!a.length || !b.length) return false;
    // A one-button shortcut may not also be the prefix of a two-button shortcut.
    return a.every(x => b.includes(x)) || b.every(x => a.includes(x));
  }
  function normalize(input) {
    const out = defaults();
    if (!input || input.schema !== 1 || !input.bindings ||
        typeof input.bindings !== 'object') return out;
    for (const action of ACTIONS) {
      const choice = validButtons(input.bindings[action]);
      if (!ACTIONS.some(other => other !== action && conflict(choice, out.bindings[other])))
        out.bindings[action] = choice;
    }
    return out;
  }
  function load() {
    try { return normalize(JSON.parse(root.localStorage.getItem(KEY) || 'null')); }
    catch (_) { return defaults(); }
  }
  function save(value) {
    const safe = normalize(value);
    try { root.localStorage.setItem(KEY, JSON.stringify(safe)); return true; }
    catch (_) { return false; }
  }
  function assign(action, buttons) {
    if (!ACTIONS.includes(action)) return { ok: false, error: 'invalid' };
    const value = buttons.length ? validButtons(buttons) : [];
    if (buttons.length && !value.length) return { ok: false, error: 'invalid' };
    const state = load();
    if (ACTIONS.some(other => other !== action && conflict(value, state.bindings[other])))
      return { ok: false, error: 'conflict' };
    state.bindings[action] = value;
    return save(state) ? { ok: true } : { ok: false, error: 'storage' };
  }
  function pads() {
    try { return Array.from(root.navigator?.getGamepads?.() || [])
      .filter(p => p && p.connected !== false && Number.isInteger(p.index) && typeof p.id === 'string')
      .sort((a, b) => a.index - b.index); }
    catch (_) { return []; }
  }
  function playerPad() {
    const list = pads();
    const wanted = emulator?.gamepadSelection?.[0];
    if (wanted) return list.find(p => p.id + '_' + p.index === wanted) || null;
    const setting = root.NGGamepadManager?.load?.()?.players?.[0];
    if (setting) {
      const matches = list.filter(p => p.id === setting.id);
      return matches[setting.ordinal] || null;
    }
    return list[0] || null;
  }
  function pressed(pad) {
    if (!pad) return [];
    return Array.from(pad.buttons || []).flatMap((v, i) =>
      i <= 31 && (typeof v === 'number' ? v >= .65 : v?.pressed === true || v?.value >= .65)
        ? [i] : []);
  }
  function label(b) { return b.length ? b.map(n => 'B' + n).join(' + ') : t('unassigned'); }
  function announce(message) {
    if (!emulator?.elements?.parent || !root.document) return;
    if (!toast) {
      toast = root.document.createElement('div');
      toast.className = 'ng-gamepad-shortcut-hint';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
    }
    if (toast.parentElement !== emulator.elements.parent) emulator.elements.parent.appendChild(toast);
    toast.textContent = message;
    toast.hidden = false;
    if (toastTimer !== null) root.clearTimeout?.(toastTimer);
    toastTimer = root.setTimeout?.(() => { if (toast) toast.hidden = true; }, DOUBLE_MS) ?? null;
  }
  function clearConfirm() { confirmAction = null; confirmAt = 0; }
  function clearToast() {
    if (toastTimer !== null) root.clearTimeout?.(toastTimer);
    toastTimer = null;
    toast?.remove?.();
    toast = null;
  }
  function blocked(action) {
    if (!emulator?.started || root.document?.hidden ||
        root.document?.body?.classList?.contains?.('ng-dialog-active')) return true;
    try {
      const controlMenuOpen = emulator.controlMenu?.style?.display === '';
      if (action === 'controls' && controlMenuOpen) return false;
      if (controlMenuOpen || emulator.settingsMenu?.style?.display === '' ||
          emulator.settingsMenuOpen || emulator.isPopupOpen?.()) return true;
    } catch (_) { return true; }
    return false;
  }
  function run(action, now) {
    if (blocked(action)) { clearConfirm(); return false; }
    if (DANGEROUS.has(action)) {
      if (confirmAction !== action || now - confirmAt > DOUBLE_MS || now < confirmAt) {
        confirmAction = action; confirmAt = now;
        announce(t(action === 'library' ? 'press_again_exit' : 'press_again_restart'));
        return true;
      }
    }
    clearConfirm();
    try {
      if (action === 'pause') return !!root.NGTabPause?.toggle?.();
      if (action === 'fullscreen') {
        if (typeof emulator.toggleFullscreen !== 'function') return false;
        const enter = !root.document.fullscreenElement;
        // Browser Fullscreen API can still reject a gamepad-only request.
        if (enter && root.navigator?.userActivation?.isActive === false) {
          announce(t('fullscreen_requires_activation'));
          return false;
        }
        emulator.toggleFullscreen(enter);
        return true;
      }
      if (action === 'library') {
        const link = root.document.querySelector?.('.player-header .back-btn');
        if (!link) return false;
        detach();
        link.click();
        return true;
      }
      if (action === 'mute') {
        if (typeof emulator.setVolume !== 'function') return false;
        if (emulator.muted && (!emulator.volume || emulator.volume <= 0)) emulator.volume = 0.5;
        emulator.setVolume(emulator.muted ? emulator.volume : 0);
        return true;
      }
      if (action === 'restart') {
        if (typeof emulator.gameManager?.restart !== 'function' || emulator.isNetplay) return false;
        emulator.gameManager.restart();
        if (emulator.paused) emulator.play?.();
        return true;
      }
      if (action === 'controls') {
        if (!emulator.controlMenu?.style) return false;
        emulator.controlMenu.style.display = emulator.controlMenu.style.display === 'none' ? '' : 'none';
        return true;
      }
    } catch (error) { console.warn('NeoGeo gamepad shortcut:', action, error); return false; }
    return false;
  }
  function tickGame() {
    if (!emulator || root.document?.hidden) { lastKeys = ''; clearConfirm(); return; }
    const pad = playerPad();
    const identity = pad ? pad.id + '_' + pad.index : '';
    const keys = pressed(pad);
    const signature = code(keys);
    if (identity !== lastPad) {
      lastPad = identity;
      lastKeys = signature;
      clearConfirm();
      return;
    }
    if (signature === lastKeys) return;
    lastKeys = signature;
    if (!signature) return;
    const action = ACTIONS.find(a => activeBindings[a].length && signature === code(activeBindings[a]));
    if (action) run(action, root.performance?.now?.() ?? Date.now());
  }
  function attach(em) {
    detach();
    emulator = em || null;
    if (!emulator) return;
    const pad = playerPad();
    lastPad = pad ? pad.id + '_' + pad.index : '';
    lastKeys = code(pressed(pad));
    activeBindings = load().bindings;
    if (ACTIONS.some(a => activeBindings[a].length))
      gameTimer = root.setInterval?.(tickGame, 65) ?? null;
  }
  function detach() {
    if (gameTimer !== null) root.clearInterval?.(gameTimer);
    gameTimer = null;
    clearConfirm();
    clearToast();
    emulator = null;
    activeBindings = defaults().bindings;
    lastKeys = '';
    lastPad = '';
  }
  function el(tag, text, klass) {
    const node = root.document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (klass) node.className = klass;
    return node;
  }
  function feedback(message) {
    const elem = $('ng-gps-feedback');
    if (elem) elem.textContent = message;
  }
  function refreshLabels() {
    if (!settingsFrame) return;
    for (const a of ACTIONS) {
      const node = $('ng-gps-bind-' + a);
      if (node) node.textContent = label(load().bindings[a]);
    }
  }
  function tickSettings() {
    if (!settingsFrame || $('ng-gamepad-shortcuts-root') !== settingsFrame) {
      if (settingsTimer !== null) root.clearInterval?.(settingsTimer);
      settingsTimer = null; settingsFrame = null; capture = null; return;
    }
    if (!capture || root.document.hidden) return;
    if (Date.now() - capture.since > CAPTURE_MS) {
      capture = null; feedback(t('capture_timeout')); return;
    }
    const pad = playerPad(), keys = pressed(pad);
    if (!capture.neutral) {
      if (keys.length === 0) capture.neutral = true;
      return;
    }
    if (keys.length) {
      // Retain the largest simultaneous set while buttons are released one by one.
      if (keys.length > 2) { capture.seen = null; capture.invalid = true; feedback(t('max_two')); }
      else if (!capture.invalid && (!capture.seen || keys.length > capture.seen.length)) capture.seen = keys;
      return;
    }
    if (capture.invalid) { capture = null; feedback(t('max_two')); return; }
    if (capture.seen?.length) {
      const action = capture.action, buttons = capture.seen;
      capture = null;
      const result = assign(action, buttons);
      feedback(t(result.ok ? 'saved' : result.error));
      refreshLabels();
    }
  }
  function mount() {
    const host = $('ng-gamepad-shortcuts-root');
    if (!host) return;
    if (settingsTimer !== null) root.clearInterval?.(settingsTimer);
    settingsFrame = host;
    capture = null;
    host.replaceChildren();
    host.appendChild(el('h3', t('title')));
    host.appendChild(el('p', t('description'), 'ng-gamepad-note'));
    const actions = el('div', undefined, 'ng-gps-actions');
    for (const action of ACTIONS) {
      const row = el('div', undefined, 'ng-gps-row');
      const details = el('div', undefined, 'ng-gps-details');
      details.appendChild(el('strong', t(action)));
      const current = el('span', label(load().bindings[action]), 'ng-gps-current');
      current.id = 'ng-gps-bind-' + action;
      details.appendChild(current);
      const assignButton = el('button', t('bind'), 'secondary ng-gps-bind');
      assignButton.type = 'button';
      assignButton.setAttribute('aria-label', t('bind') + ': ' + t(action));
      assignButton.addEventListener('click', () => {
        capture = { action, since: Date.now(), neutral: false, seen: null };
        feedback(t('capture_prompt'));
      });
      const clearButton = el('button', t('clear'), 'secondary ng-gps-clear');
      clearButton.type = 'button';
      clearButton.setAttribute('aria-label', t('clear') + ': ' + t(action));
      clearButton.addEventListener('click', () => {
        capture = null;
        const result = assign(action, []);
        feedback(t(result.ok ? 'cleared' : result.error));
        refreshLabels();
      });
      row.append(details, assignButton, clearButton);
      actions.appendChild(row);
    }
    host.appendChild(actions);
    const status = el('p', '', 'ng-gps-feedback');
    status.id = 'ng-gps-feedback'; status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    host.appendChild(status);
    host.appendChild(el('p', t('privacy'), 'ng-gamepad-note'));
    settingsTimer = root.setInterval?.(tickSettings, 80) ?? null;
  }
  root.addEventListener?.('pagehide', detach);
  root.addEventListener?.('blur', () => { lastKeys = ''; clearConfirm(); });
  root.document?.addEventListener?.('visibilitychange', () => { lastKeys = ''; clearConfirm(); });
  root.NGGamepadShortcuts = Object.freeze({ ACTIONS, normalize, load, save, assign,
    attach, detach, mount, tickGame, tickSettings });
})(window);
