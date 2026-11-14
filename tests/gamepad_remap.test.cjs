'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const repo = path.resolve(__dirname, '..');
const source = () => fs.readFileSync(path.join(repo, 'web/controls/gamepad-remap.js'), 'utf8');

class Node {
  constructor(tag = 'div') { this.tagName = tag; this.children = []; this.attrs = {}; this.listeners = {};
    this.textContent = ''; this.id = ''; this.className = ''; this.parentElement = null; }
  append(...items) { for (const item of items) { item.parentElement = this; this.children.push(item); } }
  appendChild(n) { this.append(n); return n; }
  replaceChildren(...items) { this.children = []; this.append(...items); }
  addEventListener(n, fn) { this.listeners[n] = fn; }
  setAttribute(n, v) { this.attrs[n] = v; }
  click() { this.listeners.click?.(); }
}
function walk(root, id) { if (root.id === id) return root;
  for (const n of root.children) { const found = walk(n, id); if (found) return found; } return null; }
function find(root, predicate, result = []) { if (predicate(root)) result.push(root);
  for (const c of root.children) find(c, predicate, result); return result; }
function mock(initial = {}) {
  const store = new Map(Object.entries(initial));
  const host = new Node(); host.id = 'ng-gamepad-remap-root';
  const document = { hidden: false, getElementById: id => walk(host, id), createElement: tag => new Node(tag) };
  const pads = [{ index: 0, id: 'GameSir Test Pad', connected: true, buttons: Array.from({ length: 18 }, () => ({ pressed: false })), axes: [0, 0, 0, 0] }];
  const w = {
    document, navigator: { getGamepads: () => pads },
    localStorage: { getItem: k => store.get(k) ?? null, setItem: (k,v) => store.set(k, v) },
    NGI18n: { t: k => k },
    NGGamepadManager: { load: () => ({ players: { 0: null, 1: null } }) },
    NGGamepadShortcuts: { load: () => ({ bindings: {} }) },
    addEventListener() {}, setInterval(fn) { this.interval = fn; return 1; }, clearInterval() {}
  };
  const context = vm.createContext({ window: w, Date, Number, Set, Object, Array, Map, String, RegExp });
  vm.runInContext(source(), context, { filename: 'gamepad-remap.js' });
  return { api: w.NGGamepadRemap, w, document, host, pads, store };
}
function core() {
  const controls = { 0: {}, 1: {} }, original = { 0: {}, 1: {} };
  for (const p of [0, 1]) for (const retro of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
    controls[p][retro] = { value: 65 + retro, value2: 'OLD_' + retro };
    original[p][retro] = { ...controls[p][retro] };
  }
  return { controls, defaultControllers: structuredClone(original), gamepad: { getButtonLabel: idx => idx === 0 ? 'BUTTON_1' : idx === 1 ? 'BUTTON_2' : idx === 4 ? 'LEFT_TOP_SHOULDER' : idx === 9 ? 'START' : idx === 12 ? 'DPAD_UP' : 'GAMEPAD_' + idx },
    updates: 0, checkGamepadInputs() { this.updates++; }, saveSettings() { throw Error('Vendor settings must not be written'); } };
}

test('no custom gamepad profile preserves native EmulatorJS input and keyboard mapping', () => {
  const { api } = mock(); const em = core(), before = structuredClone(em.controls);
  assert.equal(api.attach(em), true);
  assert.deepEqual(em.controls, before);
  assert.equal(em.updates, 0);
  api.detach();
});

test('assign GameSir button to Neo Geo A swaps B instead of mapping both actions', () => {
  const { api } = mock();
  const result = api.assign(0, 'a', 'B0');
  assert.equal(result.ok, true); assert.equal(result.swapped, 'b');
  const profile = api.load().players[0].bindings;
  assert.equal(profile.a, 'B0'); assert.equal(profile.b, 'B1');
  const em = core();
  assert.equal(api.attach(em), true);
  assert.equal(em.controls[0][0].value2, 'BUTTON_1');
  assert.equal(em.controls[0][8].value2, 'BUTTON_2');
  assert.equal(em.controls[0][0].value, 65);
  assert.equal(em.defaultControllers[0][0].value2, 'OLD_0');
  api.detach();
  assert.equal(em.controls[0][0].value2, 'OLD_0');
});

test('player 2 is separate; button indices, directions, Start and Coin match native RetroPad IDs', () => {
  const { api } = mock();
  assert.equal(api.assign(1, 'a', 'B4').ok, true);
  assert.equal(api.assign(1, 'coin', 'B17').ok, true);
  const em = core(); api.attach(em);
  assert.equal(em.controls[1][0].value2, 'LEFT_TOP_SHOULDER');
  assert.equal(em.controls[1][2].value2, 'GAMEPAD_17');
  assert.equal(em.controls[1][4].value2, 'DPAD_UP');
  assert.equal(em.controls[1][3].value2, 'START');
  assert.equal(em.controls[0][0].value2, 'OLD_0');
  api.detach();
});

test('stick axis directions map natively, never as keyboard events', () => {
  const { api } = mock();
  assert.equal(api.assign(0, 'up', 'AX1-').ok, true);
  assert.equal(api.assign(0, 'right', 'AX0+').ok, true);
  assert.equal(api.assign(0, 'a', 'AX0+').ok, false);
  const em = core(); api.attach(em);
  assert.equal(em.controls[0][4].value2, 'LEFT_STICK_Y:-1');
  assert.equal(em.controls[0][7].value2, 'LEFT_STICK_X:+1');
  api.detach();
});

test('invalid profiles, duplicate buttons and corrupted storage never enter live native controls', () => {
  const { api, store } = mock();
  assert.equal(api.assign(0, 'evil', 'B0').ok, false);
  assert.equal(api.assign(0, 'up', 'AX99+').ok, false);
  assert.equal(api.assign(0, 'a', 'B999').ok, false);
  const bad = { schema: 1, players: { 0: { bindings: { up: 'B0', down: 'B0' } } } };
  assert.equal(api.normalize(bad).players[0], null);
  store.set(api.STORAGE_KEY, '{bad json');
  const em = core(), before = structuredClone(em.controls);
  api.attach(em); assert.deepEqual(em.controls, before);
  api.detach();
});

test('explicit restore of native mapping and standard layout only change saved gamepad profile', () => {
  const { api } = mock();
  api.assign(0, 'a', 'B4');
  assert.equal(api.reset(0), true);
  assert.equal(api.load().players[0].bindings.a, 'B1');
  assert.equal(api.reset(0, true), true);
  assert.equal(api.load().players[0], null);
});

test('gamepad shortcut button conflicts are rejected to prevent unintended pause/exit', () => {
  const { api, w } = mock();
  w.NGGamepadShortcuts.load = () => ({ bindings: { pause: [4], library: [5, 6] } });
  assert.equal(api.assign(0, 'a', 'B4').error, 'shortcut_conflict');
  assert.equal(api.assign(0, 'a', 'B5').error, 'shortcut_conflict');
  assert.equal(api.assign(1, 'a', 'B4').ok, true);
});

test('localStorage blocked is graceful and does not overwrite custom default settings', () => {
  const { api, w } = mock();
  w.localStorage.setItem = () => { throw Error('storage denied'); };
  const result = api.assign(0, 'a', 'B4');
  assert.equal(result.error, 'storage');
  assert.equal(api.load().players[0], null);
});

test('settings UI renders controller editor before playing and captures physical button after release', () => {
  const { api, host, pads, w } = mock();
  api.mount();
  const bindButtons = find(host, n => n.className.includes('ng-gpr-capture'));
  assert.equal(bindButtons.length, 10);
  bindButtons[4].click(); // Neo Geo A
  api.tickSettings(); // Establish neutral
  pads[0].buttons[4].pressed = true;
  api.tickSettings();
  pads[0].buttons[4].pressed = false;
  api.tickSettings();
  assert.equal(api.load().players[0].bindings.a, 'B4');
  assert.equal(w.interval !== undefined, true);
});

test('mouse capture remains on selected player only and no connected controller is safe', () => {
  const { api, host, pads } = mock();
  api.mount();
  const tabs = find(host, n => n.className === 'ng-gpr-tabs')[0];
  tabs.children[1].click();
  const bind = find(host, n => n.className.includes('ng-gpr-capture'));
  bind[4].click();
  pads.splice(0);
  api.tickSettings();
  assert.equal(api.load().players[1], null);
});

test('clearing one gamepad action leaves all others and keyboard controls alone', () => {
  const { api } = mock(); api.assign(0, 'a', 'B4');
  assert.equal(api.assign(0, 'a', null).ok, true);
  const e = core(); api.attach(e);
  assert.equal(e.controls[0][0].value2, '');
  assert.equal(e.controls[0][8].value2, 'BUTTON_1');
  api.detach();
});

test('integration is settings/player only and vendor files are unchanged', () => {
  const read = p => fs.readFileSync(path.join(repo, p), 'utf8');
  const settings = read('web/settings.js');
  const html = read('web/settings.html');
  const player = read('web/player.js');
  const ph = read('web/player.html');
  assert(settings.indexOf("NGI18n.t('gamepad_manager.title')") < settings.indexOf("NGI18n.t('settings.global_controls_neo_geo_custom')"));
  assert.match(settings, /NGGamepadRemap\?\.mount\?\.\(\)/);
  assert.match(player, /NGGamepadRemap\?\.attach\?\.\(window\.EJS_emulator\)/);
  assert.match(player, /NGGamepadRemap\?\.detach\?\.\(\)/);
  assert.match(html, /gamepad-remap\.js\?v=1\.4\.2/);
  assert.match(ph, /gamepad-remap\.js\?v=1\.4\.2/);
  assert.doesNotMatch(read('web/index.html'), /gamepad-remap\.js/);
  assert.doesNotMatch(source(), /simulateInput|dispatchEvent\(.*keydown|\.saveSettings\(/);
});
