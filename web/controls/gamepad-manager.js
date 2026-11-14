/* Gamepad Manager v1.4.0: local device assignments and diagnostics, using native EmulatorJS input. */
'use strict';
(function (root) {
  const STORAGE_KEY = 'ng-gamepad-manager-v1';
  const SCHEMA = 1;
  const MAX_ID = 256;
  const MAX_ORDINAL = 7;
  const AUTO = '';
  const $ = id => document.getElementById(id);
  const t = name => root.NGI18n?.t?.('gamepad_manager.' + name) || name;
  const defaults = () => ({ schema: SCHEMA, players: { 0: null, 1: null } });
  let settingsRoot = null;
  let settingsInterval = null;
  let gameInterval = null;
  let emulator = null;
  let installedEvents = false;
  let currentTestKey = AUTO;
  let lastTester = '';
  let lastInventory = '';

  // Keep persistent identifiers bounded, without storing Gamepad API buttons, axes or timestamps.
  function validChoice(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (typeof value.id !== 'string' || !value.id.length || value.id.length > MAX_ID ||
        !Number.isInteger(value.ordinal) || value.ordinal < 0 || value.ordinal > MAX_ORDINAL)
      return null;
    return { id: value.id, ordinal: value.ordinal };
  }
  function keyFor(value) {
    return value ? JSON.stringify([value.id, value.ordinal]) : AUTO;
  }
  function normalize(input) {
    const out = defaults();
    if (!input || input.schema !== SCHEMA || !input.players || typeof input.players !== 'object')
      return out;
    out.players[0] = validChoice(input.players[0]);
    out.players[1] = validChoice(input.players[1]);
    if (out.players[0] && keyFor(out.players[0]) === keyFor(out.players[1]))
      out.players[1] = null;
    return out;
  }
  function load() {
    try { return normalize(JSON.parse(root.localStorage.getItem(STORAGE_KEY) || 'null')); }
    catch (_) { return defaults(); }
  }
  function save(value) {
    const safe = normalize(value);
    try {
      root.localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
      sync();
      return true;
    } catch (_) { return false; }
  }

  // Match identical device models by their current ordinal, not an unstable browser index.
  function devices() {
    let raw = [];
    try {
      raw = typeof navigator.getGamepads === 'function'
        ? Array.from(navigator.getGamepads() || []).filter(Boolean) : [];
    } catch (_) { return []; }
    const counts = new Map();
    return raw.filter(p => p.connected !== false && typeof p.id === 'string' &&
      p.id.length > 0 && p.id.length <= MAX_ID && Number.isInteger(p.index))
      .sort((a, b) => a.index - b.index)
      .map(p => {
        const ordinal = counts.get(p.id) || 0;
        counts.set(p.id, ordinal + 1);
        return { id: p.id, ordinal, index: p.index, key: keyFor({ id: p.id, ordinal }),
          buttons: p.buttons || [], axes: p.axes || [], mapping: p.mapping || '' };
      });
  }
  function choose(player, key) {
    if (![0, 1].includes(Number(player))) return false;
    const p = Number(player);
    const choice = key === AUTO ? null : devices().find(x => x.key === key);
    if (key !== AUTO && !choice) return false;
    const state = load();
    if (choice && keyFor(state.players[1 - p]) === key) return false;
    state.players[p] = choice ? { id: choice.id, ordinal: choice.ordinal } : null;
    return save(state);
  }

  // Populate both native player slots without creating a parallel input or touching key bindings.
  function sync() {
    const em = emulator;
    if (!em || !Array.isArray(em.gamepadSelection) ||
        !Array.isArray(em.gamepad?.gamepads)) return false;
    const wanted = load().players;
    if (!wanted[0] && !wanted[1]) return false;
    const counts = new Map();
    const native = em.gamepad.gamepads.filter(x => x && typeof x.id === 'string' &&
      Number.isInteger(x.index)).sort((a, b) => a.index - b.index).map(p => {
      const ordinal = counts.get(p.id) || 0;
      counts.set(p.id, ordinal + 1);
      return { key: keyFor({ id: p.id, ordinal }), native: p.id + '_' + p.index };
    });
    const desired = em.gamepadSelection.slice();
    for (const player of [0, 1]) {
      if (wanted[player]) {
        desired[player] = native.find(x => x.key === keyFor(wanted[player]))?.native || '';
      }
    }
    // An explicit assignment wins over the other player's original automatic slot.
    for (const player of [0, 1]) {
      const other = 1 - player;
      if (wanted[player] && desired[player] && desired[other] === desired[player]) {
        desired[other] = native.find(x => x.native !== desired[player])?.native || '';
      }
    }
    if (desired[0] === em.gamepadSelection[0] && desired[1] === em.gamepadSelection[1])
      return true;
    em.gamepadSelection[0] = desired[0];
    em.gamepadSelection[1] = desired[1];
    try { em.updateGamepadLabels?.(); } catch (_) { /* Vendor popup may be absent. */ }
    return true;
  }
  function onDeviceChange() {
    // Allow the vendor's own gamepadconnected handler to finish its automatic assignment.
    root.setTimeout?.(() => { sync(); refresh(); }, 120);
  }
  function attach(em) {
    detach();
    emulator = em || null;
    if (!emulator) return;
    sync();
    // This slow reconciliation also handles reconnects missed by browser gamepad events.
    if (load().players[0] || load().players[1]) {
      gameInterval = root.setInterval?.(sync, 1200) ?? null;
    }
    if (!installedEvents) {
      root.addEventListener?.('gamepadconnected', onDeviceChange);
      root.addEventListener?.('gamepaddisconnected', onDeviceChange);
      root.addEventListener?.('pagehide', detach);
      installedEvents = true;
    }
  }
  function detach() {
    if (gameInterval !== null) root.clearInterval?.(gameInterval);
    gameInterval = null;
    emulator = null;
  }

  function element(tag, label, className = '') {
    const node = document.createElement(tag);
    if (label !== undefined) node.textContent = label;
    if (className) node.className = className;
    return node;
  }
  // Rebuild a select only when device identities or assignments actually change.
  function populate(select, list, selected, label) {
    select.replaceChildren();
    const automatic = element('option', t('auto'));
    automatic.value = AUTO;
    select.appendChild(automatic);
    for (const pad of list) {
      const option = element('option', pad.id + ' [' + (pad.index + 1) + ']');
      option.value = pad.key;
      select.appendChild(option);
    }
    if (selected && !list.some(x => x.key === selected)) {
      const missing = element('option', t('disconnected') + ': ' + label);
      missing.value = selected;
      select.appendChild(missing);
    }
    select.value = selected || AUTO;
  }
  function refresh() {
    const frame = $('ng-gamepad-manager-root');
    if (!settingsRoot || frame !== settingsRoot) {
      if (settingsInterval !== null) root.clearInterval?.(settingsInterval);
      settingsInterval = null;
      settingsRoot = null;
      return;
    }
    if (document.hidden) return;
    const list = devices(), state = load();
    const stamp = JSON.stringify([list.map(x => [x.key, x.index]),
      keyFor(state.players[0]), keyFor(state.players[1])]);
    if (stamp !== lastInventory) {
      lastInventory = stamp;
      const p1 = $('ng-gamepad-p1'), p2 = $('ng-gamepad-p2');
      if (p1 && p2) {
        populate(p1, list, keyFor(state.players[0]), state.players[0]?.id || '');
        populate(p2, list, keyFor(state.players[1]), state.players[1]?.id || '');
      }
      const test = $('ng-gamepad-test-select');
      if (test) {
        populate(test, list, currentTestKey, '');
        if (!list.some(x => x.key === currentTestKey)) currentTestKey = list[0]?.key || AUTO;
        test.value = currentTestKey;
      }
      const status = $('ng-gamepad-connected');
      if (status) status.textContent = list.length ?
        t('connected') + ': ' + list.length : t('no_devices');
    }
    const pad = list.find(x => x.key === currentTestKey);
    const buttons = pad ? Array.from(pad.buttons).map((button, i) =>
      (typeof button === 'number' ? button : button?.value || 0) > 0.5 ? 'B' + i : '')
      .filter(Boolean).join(', ') : '';
    const axes = pad ? Array.from(pad.axes).map((v, i) =>
      Number.isFinite(v) && Math.abs(v) >= 0.2 ? 'A' + i + ': ' + v.toFixed(2) : '')
      .filter(Boolean).join(' · ') : '';
    const summary = pad ? `${t('pressed')}: ${buttons || '—'}\n${t('axes')}: ${axes || '—'}` : t('press_to_detect');
    if (summary !== lastTester) {
      lastTester = summary;
      const display = $('ng-gamepad-tester-output');
      if (display) display.textContent = summary;
    }
  }
  function mount() {
    const frame = $('ng-gamepad-manager-root');
    if (!frame) {
      if (settingsInterval !== null) root.clearInterval?.(settingsInterval);
      settingsInterval = null;
      settingsRoot = null;
      return;
    }
    if (frame === settingsRoot) return;
    if (settingsInterval !== null) root.clearInterval?.(settingsInterval);
    settingsRoot = frame;
    lastInventory = '';
    lastTester = '';
    frame.replaceChildren();
    const note = element('p', t('privacy_note'), 'ng-gamepad-note');
    const status = element('p', t('press_to_detect'), 'ng-gamepad-status');
    status.id = 'ng-gamepad-connected';
    status.setAttribute('role', 'status');
    frame.append(note, status);
    const assign = element('div', undefined, 'ng-gamepad-assignments');
    for (const [index, label] of [[0, t('p1')], [1, t('p2')]]) {
      const group = element('label', undefined, 'ng-gamepad-choice');
      group.appendChild(element('span', label));
      const select = element('select');
      select.id = 'ng-gamepad-p' + (index + 1);
      select.setAttribute('aria-label', label);
      select.addEventListener('change', () => {
        const ok = choose(index, select.value);
        const result = $('ng-gamepad-assignment-status');
        if (result) result.textContent = t(ok ? 'saved' : 'duplicate');
        lastInventory = '';
        refresh();
      });
      group.appendChild(select);
      assign.appendChild(group);
    }
    frame.appendChild(assign);
    const feedback = element('p', '', 'ng-gamepad-feedback');
    feedback.id = 'ng-gamepad-assignment-status';
    feedback.setAttribute('role', 'status');
    frame.appendChild(feedback);
    const testLabel = element('label', undefined, 'ng-gamepad-choice ng-gamepad-tester-title');
    testLabel.appendChild(element('span', t('tester')));
    const test = element('select');
    test.id = 'ng-gamepad-test-select';
    test.setAttribute('aria-label', t('tester'));
    test.addEventListener('change', () => { currentTestKey = test.value; lastTester = ''; refresh(); });
    testLabel.appendChild(test);
    frame.appendChild(testLabel);
    const output = element('pre', '', 'ng-gamepad-test-output');
    output.id = 'ng-gamepad-tester-output';
    output.setAttribute('role', 'status');
    frame.appendChild(output);
    frame.appendChild(element('p', t('mapping_note'), 'ng-gamepad-note'));
    const fallback = devices();
    currentTestKey = fallback[0]?.key || AUTO;
    refresh();
    settingsInterval = root.setInterval?.(refresh, 180) ?? null;
  }
  root.NGGamepadManager = Object.freeze({ STORAGE_KEY, normalize, load, save, devices,
    choose, attach, detach, sync, mount, refresh });
})(globalThis);
