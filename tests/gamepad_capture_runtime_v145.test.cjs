'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const repo = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(repo, p), 'utf8');

class Element {
  constructor(tag = 'div') {
    this.tagName = tag; this.children = []; this.attrs = {}; this.listeners = {};
    this.textContent = ''; this.className = ''; this.id = ''; this.parentElement = null;
    this.dataset = {};
  }
  append(...nodes) { for (const node of nodes) { node.parentElement = this; this.children.push(node); } }
  appendChild(node) { this.append(node); return node; }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  addEventListener(key, fn) { (this.listeners[key] ||= []).push(fn); }
  setAttribute(key, val) { this.attrs[key] = String(val); }
  click() { for (const cb of this.listeners.click || []) cb(); }
}
const walk = node => [node, ...node.children.flatMap(walk)];
const has = (node, cls) => node.className.split(/\s+/).includes(cls);
const select = (node, cls) => walk(node).filter(el => has(el, cls));

function harness(store = new Map(), axes = [0, -1, 0, 1]) {
  const host = new Element(); host.id = 'ng-gamepad-remap-root';
  const pads = Array.from({ length: 2 }, (_, index) => ({
    id: 'GameSir-' + index, index, connected: true,
    axes: [...axes], buttons: Array.from({ length: 20 }, () => ({ pressed: false, value: 0 }))
  }));
  const callbacks = new Map();
  const document = {
    hidden: false, createElement: tag => new Element(tag),
    getElementById: id => walk(host).find(el => el.id === id) || null,
    addEventListener: (name, fn) => callbacks.set(name, fn)
  };
  const win = {
    document, navigator: { getGamepads: () => pads },
    localStorage: { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) },
    NGGamepadManager: { load: () => ({ players: { 0: null, 1: null } }) },
    NGGamepadShortcuts: { load: () => ({ bindings: {} }) },
    NGI18n: { t: k => k },
    CustomEvent: class { constructor(type, opts = {}) { this.type = type; this.detail = opts.detail; } },
    addEventListener() {}, dispatchEvent() {}, setInterval(fn) { this.tick = fn; return 1; }, clearInterval() {}
  };
  vm.runInNewContext(read('web/controls/gamepad-remap.js'), { window: win }, { filename: 'gamepad-remap.js' });
  return { host, pads, store, win, api: win.NGGamepadRemap };
}
function press(pad, idx, yes) { pad.buttons[idx].pressed = yes; pad.buttons[idx].value = yes ? 1 : 0; }

// A real controller may report analog triggers as -1 and +1 at rest.
test('GameSir B4 saves after release even when another analog axis idles at -1/+1', () => {
  const h = harness(); h.api.mount();
  select(h.host, 'ng-gpr-capture')[4].click();
  h.api.tickSettings();
  press(h.pads[0], 4, true); h.api.tickSettings();
  press(h.pads[0], 4, false); h.api.tickSettings();
  assert.equal(h.api.load().players[0].bindings.a, 'B4');
  assert.equal(JSON.parse(h.store.get(h.api.STORAGE_KEY)).players[0].bindings.a, 'B4');
  assert.equal(select(h.host, 'ng-gpr-capture')[4].children[0].textContent, 'B4');
  assert.match(h.host.children.find(n => n.id === 'ng-gpr-status').textContent, /B4/);
});

test('saved GameSir mapping restores after a new page VM and does not change P2', () => {
  const stored = new Map(); const old = harness(stored);
  old.api.assign(0, 'a', 'B11');
  const page = harness(stored); page.api.mount();
  assert.equal(page.api.load().players[0].bindings.a, 'B11');
  assert.equal(page.api.load().players[1], null);
  assert.equal(select(page.host, 'ng-gpr-capture')[4].children[0].textContent, 'B11');
});

test('a stick axis can be calibrated relative to a nonzero resting position', () => {
  const h = harness(new Map(), [-1, 0, 0, 1]); h.api.mount();
  select(h.host, 'ng-gpr-capture')[3].click(); // RIGHT, allows stick axes
  h.api.tickSettings();
  h.pads[0].axes[0] = 0.1; h.api.tickSettings();
  h.pads[0].axes[0] = -1; h.api.tickSettings();
  assert.equal(h.api.load().players[0].bindings.right, 'AX0+');
});

test('button capture waits for the chosen button to release, not another held analog axis', () => {
  const h = harness(); h.api.mount();
  select(h.host, 'ng-gpr-capture')[4].click();
  h.api.tickSettings();
  press(h.pads[0], 5, true);
  for (let i = 0; i < 4; i++) h.api.tickSettings();
  assert.equal(h.api.load().players[0], null);
  press(h.pads[0], 5, false); h.api.tickSettings();
  assert.equal(h.api.load().players[0].bindings.a, 'B5');
});

test('simultaneous buttons are rejected without altering persisted assignments', () => {
  const h = harness(); h.api.mount();
  select(h.host, 'ng-gpr-capture')[4].click(); h.api.tickSettings();
  press(h.pads[0], 6, true); press(h.pads[0], 7, true);
  h.api.tickSettings();
  press(h.pads[0], 6, false); press(h.pads[0], 7, false); h.api.tickSettings();
  assert.equal(h.api.load().players[0], null);
});

test('browser storage failure never reports saved even if a real button is captured', () => {
  const h = harness(); h.win.localStorage.setItem = () => {};
  h.api.mount(); select(h.host, 'ng-gpr-capture')[4].click();
  h.api.tickSettings(); press(h.pads[0], 4, true); h.api.tickSettings();
  press(h.pads[0], 4, false); h.api.tickSettings();
  assert.equal(h.api.load().players[0], null);
  const status = h.host.children.find(el => el.id === 'ng-gpr-status');
  assert.equal(status.attrs['data-type'], 'error');
});

test('remap script and Settings/Player pages use the same new runtime revision', () => {
  assert.match(read('web/controls/gamepad-remap.js'), /VERSION = '1\.4\.5'/);
  assert.match(read('web/settings.html'), /gamepad-remap\.js\?v=1\.4\.5/);
  assert.match(read('web/player.html'), /gamepad-remap\.js\?v=1\.4\.5/);
  assert.match(read('web/settings.html'), /serviceWorker\.getRegistration/);
});

test('loopback SW special handling is present and original offline path remains intact', () => {
  const source = read('tools/offline-sw.template.js');
  assert.match(source, /\['localhost', '127\.0\.0\.1', '\[::1\]'\]/);
  assert.match(source, /fetch\(req, \{ cache: 'no-store' \}\)/);
  assert.match(source, /const hit = await cache\.match\(cachedURL\.href\)/);
  assert.match(source, /Never make a surprise network request when Fully Offline Emulator is enabled/);
});
