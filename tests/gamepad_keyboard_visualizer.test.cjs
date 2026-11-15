/* Live keyboard/gamepad reference: no browser package or vendor engine is required. */
'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const file = path.resolve(__dirname, '../web/ui/gamepad-keyboard-visualizer.js');
const source = () => fs.readFileSync(file, 'utf8');
const ACTIONS = [
  ['up', '\u2191'], ['down', '\u2193'], ['left', '\u2190'], ['right', '\u2192'],
  ['a', 'A'], ['b', 'B'], ['c', 'C'], ['d', 'D'], ['start', 'START'], ['coin', 'COIN'],
  ['combo_ab', 'A+B'], ['combo_abc', 'A+B+C'], ['combo_cd', 'C+D']
].map(([id, symbol]) => ({ id, symbol, label: 'Neo Geo ' + id }));

class Node {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.className = '';
    this.textContent = '';
    this.listeners = new Map();
    this.classList = { add: name => { this.className += ' ' + name; } };
  }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k] ?? null; }
  addEventListener(name, callback) {
    this.listeners.set(name, [...(this.listeners.get(name) || []), callback]);
  }
  append(...nodes) { this.children.push(...nodes); }
  appendChild(node) { this.children.push(node); return node; }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  querySelector(selector) {
    return descend(this, node => selector === '[data-player="0"]' ? node.dataset.player === '0'
      : selector === '[data-player="1"]' ? node.dataset.player === '1' : false);
  }
  focus() { this.focused = true; }
  click() { for (const fn of this.listeners.get('click') || []) fn(); }
}
function descendants(node) { return [node, ...node.children.flatMap(descendants)]; }
function descend(node, predicate) { return descendants(node).find(predicate) || null; }
function byClass(node, name) { return descendants(node).filter(e => e.className.split(' ').includes(name)); }
function eventEmitter() {
  const callbacks = new Map();
  return {
    addEventListener(name, callback) { callbacks.set(name, [...(callbacks.get(name) || []), callback]); },
    dispatchEvent(e) { (callbacks.get(e.type) || []).forEach(cb => cb(e)); },
    count(name) { return (callbacks.get(name) || []).length; }
  };
}
function start() {
  const host = new Node();
  host.id = 'ng-gamepad-visualizer-root';
  const windowBus = eventEmitter();
  const documentBus = eventEmitter();
  const document = {
    ...documentBus,
    createElement: tag => new Node(tag),
    getElementById: id => id === host.id && document.hasHost !== false ? host : null,
    hasHost: true
  };
  const keyboard = { players: {
    0: { up: 38, down: 40, left: 37, right: 39, a: 65, b: 83, c: 68, d: 70, start: 49, coin: 51,
      combo_ab: 81, combo_abc: 82, combo_cd: 69 },
    1: { up: 104, down: 98, left: 100, right: 102, a: 74, b: 75, c: 76, d: 80, start: 50, coin: 52,
      combo_ab: 89, combo_abc: 85, combo_cd: 73 }
  } };
  const remap = { players: { 0: null, 1: null } };
  const pad = {
    STORAGE_KEY: 'pad-mapping',
    load: () => remap,
    readable: code => code ? code : 'Unassigned'
  };
  const keyboardApi = {
    STORAGE_KEY: 'keyboard-mapping',
    ACTIONS,
    load: () => keyboard,
    getLabel: n => n === 38 ? '\u2191' : n === 112 ? 'F1' :
      n >= 65 && n <= 90 ? String.fromCharCode(n) : String(n)
  };
  const win = {
    ...windowBus,
    document,
    NGControls: keyboardApi,
    NGGamepadRemap: pad,
    NGI18n: { t: key => key },
    CustomEvent: class { constructor(type, args = {}) { this.type = type; this.detail = args.detail; } }
  };
  vm.runInNewContext(source(), { window: win }, { filename: file });
  return { api: win.NGGamepadKeyboardVisualizer, win, document, keyboard, remap, host, windowBus, documentBus };
}

test('default preview reads exact P1/P2 keyboard mappings and never assumes native gamepad button numbers', () => {
  const { api } = start();
  const p1 = api.snapshot(0), p2 = api.snapshot(1);
  assert.equal(p1.actions.find(a => a.id === 'a').keyCode, 65);
  assert.equal(p2.actions.find(a => a.id === 'a').keyCode, 74);
  assert.equal(p1.actions.find(a => a.id === 'a').gamepadLabel, 'gamepad_visualizer.native');
  assert.equal(p1.actions.find(a => a.id === 'a').gamepadCode, null);
  assert.equal(p1.native, true);
  assert.equal(api.snapshot(2), null);
});

test('custom GameSir profile maps keyboard A to physical B1, B to B0, and alternate P2 independently', () => {
  const { api, remap } = start();
  remap.players[0] = { bindings: { a: 'B1', b: 'B0', c: 'B3', d: 'B2', up: 'B12', down: 'B13', left: 'B14', right: 'B15', start: 'B9', coin: 'B8' } };
  remap.players[1] = { bindings: { a: 'B4', b: 'B5', c: 'B6', d: 'B7', up: 'AX1-', down: 'AX1+', left: 'AX0-', right: 'AX0+', start: 'B9', coin: 'B8' } };
  assert.equal(api.snapshot(0).actions.find(x => x.id === 'a').gamepadCode, 'B1');
  assert.equal(api.snapshot(1).actions.find(x => x.id === 'a').gamepadCode, 'B4');
  assert.equal(api.snapshot(1).actions.find(x => x.id === 'left').gamepadCode, 'AX0-');
});

test('render includes a physical key grid and action-to-button legend without static assumptions', () => {
  const { api, remap, host } = start();
  remap.players[0] = { bindings: { a: 'B1', b: 'B0', c: 'B3', d: 'B2', up: 'B12', down: 'B13', left: 'B14', right: 'B15', start: 'B9', coin: 'B8' } };
  assert.equal(api.mount(), true);
  const keyA = descendants(host).find(x => x.dataset.keyCode === '65');
  assert.ok(keyA);
  assert.ok(keyA.className.includes('ng-kv-active'));
  const neoA = descendants(host).find(x => x.dataset.action === 'a');
  assert.equal(descendants(neoA).find(x => x.dataset.padCode === 'B1').textContent, 'B1');
  assert.equal(byClass(host, 'ng-kv-link').length, 13);
  assert.ok(descendants(host).some(e => e.tagName === 'KBD'));
});

test('a saved GameSir button reassignment refreshes the rendered preview immediately', () => {
  const { api, remap, host, win } = start();
  remap.players[0] = { bindings: { a: 'B1' } };
  api.mount();
  remap.players[0].bindings.a = 'B3';
  win.dispatchEvent(new win.CustomEvent('ng-gamepad-remap-changed'));
  const neoA = descendants(host).find(x => x.dataset.action === 'a');
  assert.equal(descendants(neoA).find(x => x.dataset.padCode === 'B3').textContent, 'B3');
  assert.equal(descendants(neoA).some(x => x.dataset.padCode === 'B1'), false);
});

test('a keyboard change moves the highlighted key to its new physical location', () => {
  const { api, keyboard, host, win } = start();
  api.mount();
  keyboard.players[0].a = 112; // F1 is not part of the rendered primary rows.
  win.dispatchEvent(new win.CustomEvent('ng-global-controls-changed'));
  assert.ok(descendants(host).some(e => e.dataset.keyCode === '112' && e.className.includes('ng-kv-active')));
  assert.equal(descendants(host).find(e => e.dataset.keyCode === '65').className.includes('ng-kv-active'), false);
  assert.ok(byClass(host, 'ng-kv-extras').length === 1);
});

test('P1/P2 tabs follow the remap editor without sharing saved button mappings', () => {
  const { api, host, remap, win } = start();
  remap.players[1] = { bindings: { a: 'B4' } };
  api.mount();
  win.dispatchEvent(new win.CustomEvent('ng-gamepad-remap-player-changed', { detail: { player: 1 } }));
  const p2 = descendants(host).find(x => x.dataset.action === 'a');
  assert.equal(descendants(p2).find(x => x.dataset.padCode === 'B4').textContent, 'B4');
  assert.equal(descendants(host).find(x => x.dataset.player === '1').getAttribute('aria-selected'), 'true');
});

test('keyboard macros never fabricate a gamepad equivalent', () => {
  const { api, remap } = start();
  remap.players[0] = { bindings: { a: 'B1' } };
  const combo = api.snapshot(0).actions.find(x => x.id === 'combo_ab');
  assert.equal(combo.gamepadCode, null);
  assert.equal(combo.gamepadLabel, 'gamepad_visualizer.keyboard_only');
});

test('unmapped custom gamepad buttons do not appear as EmulatorJS native mappings', () => {
  const { api, remap } = start();
  remap.players[0] = { bindings: { a: null, b: 'B0' } };
  const action = api.snapshot(0).actions.find(x => x.id === 'a');
  assert.equal(action.gamepadLabel, 'gamepad_visualizer.unmapped');
  assert.equal(action.native, false);
});

test('language changes and cross-tab storage changes repaint without mutating input settings', () => {
  const { api, keyboard, document, windowBus, host } = start();
  const prior = JSON.stringify(keyboard);
  api.mount();
  document.dispatchEvent({ type: 'ng-language-changed' });
  windowBus.dispatchEvent({ type: 'storage', key: 'keyboard-mapping' });
  assert.equal(JSON.stringify(keyboard), prior);
  assert.ok(descendants(host).find(x => x.dataset.action === 'start'));
});

test('repeated mount and section changes do not register duplicate global listeners or poll gamepads', () => {
  const { api, windowBus, document } = start();
  api.mount(); api.mount();
  document.hasHost = false;
  assert.equal(api.mount(), false);
  assert.equal(windowBus.count('ng-gamepad-remap-changed'), 1);
  assert.equal(windowBus.count('ng-global-controls-changed'), 1);
  assert.doesNotMatch(source(), /getGamepads|requestAnimationFrame|setInterval|dispatchEvent\(.*keydown|\.saveSettings\(/);
});

test('module renders all user-controlled strings as text nodes without HTML injection', () => {
  const { api, keyboard, remap, host } = start();
  keyboard.players[0].a = 65;
  remap.players[0] = { bindings: { a: 'B1' } };
  api.mount();
  assert.doesNotMatch(source(), /innerHTML|insertAdjacentHTML|eval\(/);
  assert.ok(descendants(host).find(x => x.dataset.action === 'a'));
});

test('source integration is Settings-only and does not modify vendor gamepad input', () => {
  // This contract is checked on the installed repository, not only in this isolated test.
  const s = source();
  assert.match(s, /ng-gamepad-visualizer-root/);
  assert.match(s, /ng-gamepad-remap-changed/);
  assert.match(s, /ng-global-controls-changed/);
  assert.doesNotMatch(s, /\.controls\[|\.defaultControllers\[|simulateInput/);
});
