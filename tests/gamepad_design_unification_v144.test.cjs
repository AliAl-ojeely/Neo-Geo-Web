/* Regression tests for the shared Neo Geo Custom presentation and persisted gamepad assignments. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repo = path.resolve(__dirname, '..');
const source = file => fs.readFileSync(path.join(repo, file), 'utf8');
const ACTIONS = [
  ['up', '\u2191'], ['down', '\u2193'], ['left', '\u2190'], ['right', '\u2192'],
  ['a', 'A'], ['b', 'B'], ['c', 'C'], ['d', 'D'], ['start', 'START'], ['coin', 'COIN'],
  ['combo_ab', 'A+B'], ['combo_abc', 'A+B+C'], ['combo_cd', 'C+D']
].map(([id, symbol]) => ({ id, symbol, label: 'Neo Geo ' + id }));

class Node {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {};
    this.attributes = {}; this.className = ''; this.textContent = '';
    this.listeners = new Map(); this.id = '';
    this.classList = { add: cls => { this.className += ' ' + cls; } };
  }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  addEventListener(name, callback) { this.listeners.set(name, [...(this.listeners.get(name) || []), callback]); }
  click() { for (const callback of this.listeners.get('click') || []) callback(); }
  querySelector(selector) {
    const match = /^\[data-player="([01])"\]$/.exec(selector);
    return match ? walk(this).find(e => e.dataset.player === match[1]) || null : null;
  }
  focus() { this.focused = true; }
}
function walk(node) { return [node, ...node.children.flatMap(walk)]; }
function css(node, name) { return walk(node).filter(n => n.className.split(/\s+/).includes(name)); }
function events() {
  const all = new Map();
  return {
    addEventListener(name, fn) { all.set(name, [...(all.get(name) || []), fn]); },
    dispatchEvent(event) { for (const fn of all.get(event.type) || []) fn(event); },
    size(name) { return (all.get(name) || []).length; }
  };
}
function setup(storage = new Map()) {
  const remapHost = new Node(); remapHost.id = 'ng-gamepad-remap-root';
  const visualHost = new Node(); visualHost.id = 'ng-gamepad-visualizer-root';
  const windowBus = events(); const documentBus = events();
  const doc = {
    ...documentBus, hidden: false,
    createElement: tag => new Node(tag),
    getElementById: id => [remapHost, visualHost].flatMap(walk).find(e => e.id === id) || null
  };
  const pads = Array.from({ length: 2 }, (_, index) => ({
    index, id: 'GameSir Test ' + index, connected: true,
    buttons: Array.from({ length: 18 }, () => ({ pressed: false })),
    axes: [0, 0, 0, 0]
  }));
  const keyboard = { players: {
    0: { up: 38, down: 40, left: 37, right: 39, a: 65, b: 83, c: 68, d: 70, start: 49, coin: 51,
      combo_ab: 81, combo_abc: 82, combo_cd: 69 },
    1: { up: 104, down: 98, left: 100, right: 102, a: 74, b: 75, c: 76, d: 80, start: 50, coin: 52,
      combo_ab: 89, combo_abc: 85, combo_cd: 73 }
  }};
  const win = {
    ...windowBus, document: doc, navigator: { getGamepads: () => pads },
    localStorage: { setItem: (key, val) => storage.set(key, val), getItem: key => storage.get(key) ?? null },
    NGI18n: { t: key => key },
    NGControls: { STORAGE_KEY: 'keyboard-mapping', ACTIONS, load: () => keyboard,
      getLabel: n => n >= 65 && n <= 90 ? String.fromCharCode(n) : String(n) },
    NGGamepadManager: { load: () => ({ players: { 0: null, 1: null } }) },
    NGGamepadShortcuts: { load: () => ({ bindings: {} }) },
    CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } },
    setInterval(fn) { this.interval = fn; return 1; }, clearInterval() {}
  };
  vm.runInNewContext(source('web/controls/gamepad-remap.js'), { window: win }, { filename: 'gamepad-remap.js' });
  vm.runInNewContext(source('web/ui/gamepad-keyboard-visualizer.js'), { window: win }, { filename: 'gamepad-keyboard-visualizer.js' });
  return { win, doc, keyboard, pads, storage, remapHost, visualHost, remap: win.NGGamepadRemap,
    visual: win.NGGamepadKeyboardVisualizer, windowBus };
}
function pick(host, name, index = 0) {
  const found = css(host, name)[index];
  assert.ok(found, `Expected ${name} at ${index}`);
  return found;
}

test('gamepad remapper reuses the actual Neo Geo Custom card, symbol, tab and key components', () => {
  const { remap, remapHost } = setup(); remap.mount();
  assert.equal(css(remapHost, 'global-controls-intro').length, 1);
  assert.equal(css(remapHost, 'control-source-badge').length, 1);
  assert.equal(css(remapHost, 'player-control-tabs').length, 1);
  assert.equal(css(remapHost, 'controls-grid').length, 1);
  assert.equal(css(remapHost, 'control-item').length, 10);
  assert.equal(css(remapHost, 'control-symbol').length, 10);
  assert.equal(css(remapHost, 'control-key').length, 10);
  assert.equal(css(remapHost, 'ng-gpr-clear').length, 10);
  assert.equal(pick(remapHost, 'ng-gpr-tab').getAttribute('aria-selected'), 'true');
});

test('live keyboard visualizer also reuses the source cards, tabs and source badge', () => {
  const { visual, visualHost } = setup(); visual.mount();
  assert.equal(css(visualHost, 'global-controls-intro').length, 1);
  assert.equal(css(visualHost, 'control-source-badge').length, 1);
  assert.equal(css(visualHost, 'player-control-tabs').length, 1);
  assert.equal(css(visualHost, 'controls-grid').length, 1);
  assert.equal(css(visualHost, 'control-item').length, 13);
  assert.equal(css(visualHost, 'control-symbol').length, 13);
  assert.equal(css(visualHost, 'ng-kv-readonly').length, 13);
  assert.ok(css(visualHost, 'ng-kv-board').length === 1);
});

test('capturing GameSir B4 immediately persists the physical button and refreshes visual mapping', () => {
  const { remap, visual, pads, storage, remapHost, visualHost } = setup();
  remap.mount(); visual.mount();
  pick(remapHost, 'ng-gpr-capture', 4).click();
  assert.equal(css(remapHost, 'is-recording').length, 1);
  remap.tickSettings(); // Neutral release before accepting the assignment.
  pads[0].buttons[4].pressed = true; remap.tickSettings();
  pads[0].buttons[4].pressed = false; remap.tickSettings();
  assert.equal(remap.load().players[0].bindings.a, 'B4');
  assert.equal(JSON.parse(storage.get(remap.STORAGE_KEY)).players[0].bindings.a, 'B4');
  assert.equal(pick(remapHost, 'ng-gpr-capture', 4).children[0].textContent, 'B4');
  assert.equal(walk(visualHost).find(e => e.dataset.padCode === 'B4').textContent, 'B4');
  assert.equal(css(remapHost, 'is-recording').length, 0);
});

test('saved physical buttons survive browser reload and keep the other player unchanged', () => {
  const data = new Map();
  const first = setup(data);
  assert.equal(first.remap.assign(0, 'a', 'B5').ok, true);
  assert.equal(first.remap.assign(1, 'a', 'B6').ok, true);
  const reloaded = setup(data); reloaded.remap.mount(); reloaded.visual.mount();
  assert.equal(reloaded.remap.load().players[0].bindings.a, 'B5');
  assert.equal(reloaded.remap.load().players[1].bindings.a, 'B6');
  assert.equal(reloaded.visual.snapshot(0).actions.find(e => e.id === 'a').gamepadCode, 'B5');
  assert.equal(reloaded.visual.snapshot(1).actions.find(e => e.id === 'a').gamepadCode, 'B6');
});

test('explicitly selecting a native default B1 still creates a persistent custom assignment', () => {
  const { remap, storage, visual } = setup();
  assert.equal(remap.load().players[0], null);
  assert.equal(remap.assign(0, 'a', 'B1').ok, true);
  assert.equal(remap.load().players[0].bindings.a, 'B1');
  assert.equal(visual.snapshot(0).native, false);
  assert.ok(storage.get(remap.STORAGE_KEY));
});

test('silent localStorage write failure cannot falsely report that a button was saved', () => {
  const { remap, win, windowBus } = setup();
  let changes = 0;
  win.addEventListener('ng-gamepad-remap-changed', () => { changes++; });
  win.localStorage.setItem = () => {}; // Browser extension or storage implementation silently ignores the write.
  assert.equal(remap.assign(0, 'a', 'B4').error, 'storage');
  assert.equal(remap.load().players[0], null);
  assert.equal(changes, 0);
  assert.equal(windowBus.size('ng-gamepad-remap-changed') > 0, true);
});

test('changing one player tab in either editor synchronizes the other without overwriting bindings', () => {
  const { remap, visual, remapHost, visualHost } = setup();
  remap.mount(); visual.mount();
  const before = JSON.stringify(remap.load());
  pick(visualHost, 'ng-kv-tab', 1).click();
  assert.equal(pick(remapHost, 'ng-gpr-tab', 1).getAttribute('aria-selected'), 'true');
  pick(remapHost, 'ng-gpr-tab', 0).click();
  assert.equal(pick(visualHost, 'ng-kv-tab', 0).getAttribute('aria-selected'), 'true');
  assert.equal(JSON.stringify(remap.load()), before);
});

test('swaps, clear action, and restoring EmulatorJS native mapping are still persisted', () => {
  const { remap, remapHost } = setup(); remap.mount();
  assert.equal(remap.assign(0, 'a', 'B0').swapped, 'b');
  assert.equal(remap.load().players[0].bindings.b, 'B1');
  pick(remapHost, 'ng-gpr-clear', 4).click();
  assert.equal(remap.load().players[0].bindings.a, null);
  assert.equal(remap.reset(0, true), true);
  assert.equal(remap.load().players[0], null);
});

test('language refresh and untrusted labels use text nodes rather than HTML injection', () => {
  const { remap, visual, doc, remapHost, visualHost, win } = setup();
  win.NGI18n.t = key => key === 'gamepad_remap.action_a' ? '<img onerror=alert(1)>' : key;
  remap.mount(); visual.mount();
  doc.dispatchEvent({ type: 'ng-language-changed' });
  assert.ok(walk(remapHost).some(e => e.textContent === '<img onerror=alert(1)>'));
  assert.ok(css(visualHost, 'ng-kv-board').length === 1);
  assert.doesNotMatch(source('web/controls/gamepad-remap.js'), /\.innerHTML\s*=/);
  assert.doesNotMatch(source('web/ui/gamepad-keyboard-visualizer.js'), /\.innerHTML\s*=/);
});

test('gamepad assets remain shared and the Settings stylesheet stays versioned', () => {
  const html = source('web/settings.html');
  const player = source('web/player.html');
  const cssSource = source('web/style.css');
  assert.match(html, /gamepad-remap\.js\?v=1\.4\.5/);
  assert.match(player, /gamepad-remap\.js\?v=1\.4\.5/);
  assert.match(html, /gamepad-keyboard-visualizer\.js\?v=1\.4\.4/);
  // Accept later stylesheet revisions without weakening the original minimum-version check.
  const stylesheet = html.match(/\/assets\/style\.css\?v=(\d+)\.(\d+)\.(\d+)"/);
  assert.ok(stylesheet, 'Settings must reference a versioned stylesheet');
  const [major, minor, patch] = stylesheet.slice(1).map(Number);
  assert.ok(major > 1 || (major === 1 && (minor > 4 || (minor === 4 && patch >= 4))),
    'Settings CSS must not be older than v1.4.4');
  assert.match(cssSource, /#ng-gamepad-remap-root \.ng-gpr-rows\.controls-grid/);
  assert.match(cssSource, /#ng-gamepad-visualizer-root \.ng-kv-link\.control-item/);
  assert.doesNotMatch(source('web/controls/gamepad-remap.js'), /\.saveSettings\(|simulateInput/);
});
