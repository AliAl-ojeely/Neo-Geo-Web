/* Native Neo Geo gamepad gameplay remapping. Does not inject keyboard events or edit vendor files. */
'use strict';
(function (root) {
  const STORAGE_KEY = 'ng-gamepad-gameplay-mapping-v1';
  const SCHEMA = 1;
  const CAPTURE_TIMEOUT = 12000;
  const BUTTON_LIMIT = 32;
  const ACTIONS = Object.freeze([
    ['up', 4], ['down', 5], ['left', 6], ['right', 7],
    ['a', 0], ['b', 8], ['c', 1], ['d', 9], ['start', 3], ['coin', 2]
  ]);
  const DIRECTIONAL = new Set(['up', 'down', 'left', 'right']);
  const DEFAULT_CODES = Object.freeze({
    up: 'B12', down: 'B13', left: 'B14', right: 'B15',
    a: 'B1', b: 'B0', c: 'B3', d: 'B2', start: 'B9', coin: 'B8'
  });
  const BUTTON_LABELS = [
    'BUTTON_1', 'BUTTON_2', 'BUTTON_3', 'BUTTON_4',
    'LEFT_TOP_SHOULDER', 'RIGHT_TOP_SHOULDER',
    'LEFT_BOTTOM_SHOULDER', 'RIGHT_BOTTOM_SHOULDER',
    'SELECT', 'START', 'LEFT_STICK', 'RIGHT_STICK',
    'DPAD_UP', 'DPAD_DOWN', 'DPAD_LEFT', 'DPAD_RIGHT'
  ];
  const AXIS_LABELS = ['LEFT_STICK_X', 'LEFT_STICK_Y', 'RIGHT_STICK_X', 'RIGHT_STICK_Y'];
  const $ = id => root.document?.getElementById?.(id);
  const t = key => root.NGI18n?.t?.('gamepad_remap.' + key) || key;
  let frame = null;
  let interval = null;
  let currentPlayer = 0;
  let capture = null;
  let emulator = null;
  let originalMappings = [];
  let appliedMappings = [];
  let stateRevision = 0;

  function validCode(code) {
    if (code === null) return true;
    if (typeof code !== 'string') return false;
    const btn = /^B(0|[1-9]|[12][0-9]|3[01])$/.exec(code);
    const axis = /^AX([0-7])([+-])$/.exec(code);
    return !!(btn || axis);
  }
  function blank() { return { schema: SCHEMA, players: { 0: null, 1: null } }; }
  function standard() { return { bindings: { ...DEFAULT_CODES } }; }
  function normalize(raw) {
    const out = blank();
    if (!raw || raw.schema !== SCHEMA || !raw.players || typeof raw.players !== 'object') return out;
    for (const p of [0, 1]) {
      const profile = raw.players[p];
      if (!profile || !profile.bindings || typeof profile.bindings !== 'object' || Array.isArray(profile.bindings)) continue;
      const bindings = {};
      let safe = true;
      const used = new Set();
      for (const [action] of ACTIONS) {
        const code = profile.bindings[action];
        if (!validCode(code) || code === undefined ||
            (code !== null && used.has(code)) ||
            (code?.startsWith('AX') && !DIRECTIONAL.has(action))) { safe = false; break; }
        bindings[action] = code;
        if (code !== null) used.add(code);
      }
      if (safe) out.players[p] = { bindings };
    }
    return out;
  }
  function load() {
    try { return normalize(JSON.parse(root.localStorage.getItem(STORAGE_KEY) || 'null')); }
    catch (_) { return blank(); }
  }
  function save(raw) {
    const normalized = normalize(raw);
    try {
      root.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      stateRevision++;
      return true;
    } catch (_) { return false; }
  }
  function playerBindings(player) {
    const state = load();
    return state.players[player]?.bindings || { ...DEFAULT_CODES };
  }
  function shortcutConflict(player, code) {
    if (Number(player) !== 0 || !code?.startsWith('B')) return false;
    const button = Number(code.slice(1));
    try {
      const bindings = root.NGGamepadShortcuts?.load?.()?.bindings || {};
      return Object.values(bindings).some(value => Array.isArray(value) && value.includes(button));
    } catch (_) { return false; }
  }
  // A duplicate assignment swaps the old physical input with the displaced action.
  function assign(player, action, code) {
    player = Number(player);
    if (![0, 1].includes(player) || !ACTIONS.some(a => a[0] === action) ||
        !validCode(code) || code === undefined ||
        (code?.startsWith('AX') && !DIRECTIONAL.has(action)))
      return { ok: false, error: 'invalid' };
    if (shortcutConflict(player, code)) return { ok: false, error: 'shortcut_conflict' };
    const state = load();
    const profile = state.players[player] || standard();
    const oldCode = profile.bindings[action];
    if (oldCode === code) return { ok: true };
    const displaced = ACTIONS.find(([other]) => other !== action && code !== null && profile.bindings[other] === code)?.[0];
    if (displaced) {
      if (oldCode?.startsWith('AX') && !DIRECTIONAL.has(displaced))
        profile.bindings[displaced] = null;
      else profile.bindings[displaced] = oldCode;
    }
    profile.bindings[action] = code;
    state.players[player] = profile;
    return save(state) ? { ok: true, swapped: displaced || null } : { ok: false, error: 'storage' };
  }
  function reset(player, native = false) {
    player = Number(player);
    if (![0, 1].includes(player)) return false;
    const state = load();
    state.players[player] = native ? null : standard();
    return save(state);
  }
  function vendorLabel(code, em = emulator) {
    if (!code) return '';
    if (code.startsWith('B')) {
      const index = Number(code.slice(1));
      if (!Number.isInteger(index) || index < 0 || index >= BUTTON_LIMIT) return '';
      return em?.gamepad?.getButtonLabel?.(index) || BUTTON_LABELS[index] || 'GAMEPAD_' + index;
    }
    const m = /^AX([0-7])([+-])$/.exec(code);
    if (m) return (AXIS_LABELS[Number(m[1])] || 'EXTRA_STICK_' + m[1]) + ':' + (m[2] === '+' ? '+1' : '-1');
    return '';
  }
  function restore(em) {
    if (!em?.controls) return;
    for (let i = 0; i < originalMappings.length; i++) {
      const record = originalMappings[i];
      if (em.controls[record.player]?.[record.retroId]?.value2 === appliedMappings[i]) {
        if (record.had) em.controls[record.player][record.retroId].value2 = record.value;
        else delete em.controls[record.player][record.retroId].value2;
      }
    }
    try { em.checkGamepadInputs?.(); } catch (_) { /* Native menu may be gone. */ }
  }
  // Modify only the live gamepad mapping field. Keyboard value and persisted vendor settings remain intact.
  function attach(em) {
    detach();
    if (!em?.controls) return false;
    emulator = em;
    const profiles = load().players;
    for (const player of [0, 1]) {
      if (!profiles[player]) continue;
      em.controls[player] ||= {};
      for (const [action, retroId] of ACTIONS) {
        em.controls[player][retroId] ||= {};
        const target = em.controls[player][retroId];
        originalMappings.push({ player, retroId, had: Object.prototype.hasOwnProperty.call(target, 'value2'), value: target.value2 });
        const label = vendorLabel(profiles[player].bindings[action], em);
        appliedMappings.push(label);
        target.value2 = label;
      }
    }
    try { if (originalMappings.length) em.checkGamepadInputs?.(); } catch (_) { /* Optional UI refresh. */ }
    return true;
  }
  function detach() {
    if (emulator && originalMappings.length) restore(emulator);
    emulator = null;
    originalMappings = [];
    appliedMappings = [];
  }
  function connectedPads() {
    try {
      return Array.from(root.navigator?.getGamepads?.() || [])
        .filter(p => p && p.connected !== false && Number.isInteger(p.index) && typeof p.id === 'string')
        .sort((a, b) => a.index - b.index);
    } catch (_) { return []; }
  }
  function padFor(player) {
    const list = connectedPads();
    const selected = root.NGGamepadManager?.load?.()?.players?.[player];
    if (selected) return list.filter(p => p.id === selected.id)[selected.ordinal] || null;
    return list[player] || (player === 0 ? list[0] : null) || null;
  }
  function activeInput(pad, allowAxis) {
    if (!pad) return [];
    const pressed = Array.from(pad.buttons || []).flatMap((button, i) =>
      i < BUTTON_LIMIT && (typeof button === 'number' ? button >= 0.65 : button?.pressed === true || button?.value >= 0.65)
        ? ['B' + i] : []);
    if (pressed.length) return pressed;
    if (!allowAxis) return [];
    return Array.from(pad.axes || []).flatMap((value, i) =>
      i < 8 && Number.isFinite(value) && Math.abs(value) >= 0.70 ? ['AX' + i + (value > 0 ? '+' : '-')] : []);
  }
  function neutral(pad) {
    if (!pad) return true;
    const held = activeInput(pad, true);
    const axisMoving = Array.from(pad.axes || []).some(x => Number.isFinite(x) && Math.abs(x) > 0.25);
    return !held.length && !axisMoving;
  }
  function elem(tag, label, className = '') {
    const e = root.document.createElement(tag);
    if (label !== undefined) e.textContent = label;
    if (className) e.className = className;
    return e;
  }
  function feedback(msg) {
    const el = $('ng-gpr-status');
    if (el) el.textContent = msg;
  }
  function readable(code) {
    if (code === null) return t('unassigned');
    if (!code) return t('native');
    if (code.startsWith('B')) {
      const index = Number(code.slice(1));
      return 'B' + index + (index === 0 ? ' (A)' : index === 1 ? ' (B)' : index === 2 ? ' (X)' : index === 3 ? ' (Y)' : '');
    }
    return code.replace('AX', t('axis') + ' ');
  }
  function render() {
    const host = $('ng-gamepad-remap-root');
    if (!host || host !== frame) return;
    const profile = load().players[currentPlayer];
    host.replaceChildren();
    host.appendChild(elem('h3', t('title')));
    host.appendChild(elem('p', t('description'), 'ng-gpr-note'));
    const tabs = elem('div', undefined, 'ng-gpr-tabs');
    for (const player of [0, 1]) {
      const button = elem('button', t('player' + (player + 1)), 'secondary');
      button.type = 'button';
      button.setAttribute('aria-pressed', String(player === currentPlayer));
      button.addEventListener('click', () => { capture = null; currentPlayer = player; render(); });
      tabs.appendChild(button);
    }
    host.appendChild(tabs);
    host.appendChild(elem('p', t(profile ? 'custom_active' : 'native_active'), 'ng-gpr-note'));
    const list = elem('div', undefined, 'ng-gpr-rows');
    const map = profile?.bindings || DEFAULT_CODES;
    for (const [action] of ACTIONS) {
      const row = elem('div', undefined, 'ng-gpr-row');
      const details = elem('div', undefined, 'ng-gpr-details');
      const strong = elem('strong', t('action_' + action));
      const value = elem('span', readable(map[action]), 'ng-gpr-value');
      details.append(strong, value);
      const setButton = elem('button', t('capture'), 'secondary ng-gpr-capture');
      setButton.type = 'button';
      setButton.setAttribute('aria-label', t('capture') + ': ' + t('action_' + action));
      setButton.addEventListener('click', () => {
        capture = { player: currentPlayer, action, since: Date.now(), ready: false, seen: null, invalid: false };
        feedback(t('capture_hint'));
      });
      const clear = elem('button', t('clear'), 'secondary ng-gpr-clear');
      clear.type = 'button';
      clear.addEventListener('click', () => {
        capture = null;
        const result = assign(currentPlayer, action, null);
        render(); feedback(t(result.ok ? 'saved' : result.error));
      });
      row.append(details, setButton, clear);
      list.appendChild(row);
    }
    host.appendChild(list);
    const actions = elem('div', undefined, 'ng-gpr-actions');
    const defaults = elem('button', t('standard'), 'secondary');
    defaults.type = 'button';
    defaults.addEventListener('click', () => { capture = null; const ok = reset(currentPlayer); render(); feedback(t(ok ? 'saved' : 'storage')); });
    const native = elem('button', t('native_restore'), 'secondary');
    native.type = 'button';
    native.addEventListener('click', () => { capture = null; const ok = reset(currentPlayer, true); render(); feedback(t(ok ? 'saved' : 'storage')); });
    actions.append(defaults, native);
    host.appendChild(actions);
    const status = elem('p', '', 'ng-gpr-status');
    status.id = 'ng-gpr-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    host.appendChild(status);
    host.appendChild(elem('p', t('next_session'), 'ng-gpr-note'));
  }
  function tickSettings() {
    if (!frame || $('ng-gamepad-remap-root') !== frame) {
      if (interval !== null) root.clearInterval?.(interval);
      interval = null; frame = null; capture = null;
      return;
    }
    if (!capture || root.document?.hidden) return;
    if (Date.now() - capture.since > CAPTURE_TIMEOUT) {
      capture = null; feedback(t('timeout')); return;
    }
    const pad = padFor(capture.player);
    if (!pad) { feedback(t('no_pad')); return; }
    if (!capture.ready) {
      if (neutral(pad)) capture.ready = true;
      return;
    }
    const samples = activeInput(pad, DIRECTIONAL.has(capture.action));
    if (samples.length > 1) { capture.invalid = true; feedback(t('one_input')); return; }
    if (samples.length === 1 && !capture.invalid) { capture.seen = samples[0]; return; }
    if (!neutral(pad)) return;
    if (capture.invalid) { capture = null; feedback(t('one_input')); return; }
    if (!capture.seen) return;
    const { player, action, seen } = capture;
    capture = null;
    const result = assign(player, action, seen);
    render();
    feedback(t(result.ok ? (result.swapped ? 'swapped' : 'saved') : result.error));
  }
  function mount() {
    const host = $('ng-gamepad-remap-root');
    if (!host) {
      if (interval !== null) root.clearInterval?.(interval);
      interval = null; frame = null; capture = null;
      return;
    }
    if (host === frame) return;
    if (interval !== null) root.clearInterval?.(interval);
    frame = host;
    capture = null;
    render();
    interval = root.setInterval?.(tickSettings, 80) ?? null;
  }
  root.addEventListener?.('pagehide', detach);
  root.NGGamepadRemap = Object.freeze({ STORAGE_KEY, ACTIONS, DEFAULT_CODES, validCode,
    normalize, load, save, assign, reset, vendorLabel, attach, detach, padFor,
    activeInput, mount, tickSettings, readable });
})(window);
