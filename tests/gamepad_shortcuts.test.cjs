'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const SOURCE = path.join(__dirname, '..', 'web', 'controls', 'gamepad-shortcuts.js');

class Node {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase(); this.children = []; this.listeners = {};
    this.id = ''; this.className = ''; this.textContent = ''; this.parentElement = null;
    this.hidden = false; this.style = { display: 'none' };
  }
  appendChild(c) { this.children.push(c); c.parentElement = this; return c; }
  append(...xs) { xs.forEach(x => this.appendChild(x)); }
  replaceChildren(...xs) { this.children.forEach(x => x.parentElement = null); this.children = []; this.append(...xs); }
  setAttribute() {}
  addEventListener(ev, fn) { this.listeners[ev] = fn; }
  click() { this.listeners.click?.(); }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(x => x !== this); this.parentElement = null; }
}
function walk(node, id) {
  if (node.id === id) return node;
  for (const child of node.children) { const found = walk(child, id); if (found) return found; }
  return null;
}
function makeHarness() {
  let clock = 0, raw = null, gamepadIndex = 0, allowedActivation = true, clicked = 0;
  let paused = 0, restarted = 0, toggled = [], setVolumes = [];
  const pad = { id: 'GameSir', index: 0, connected: true, buttons: Array.from({ length: 18 }, () => ({ value: 0, pressed: false })) };
  const other = { id: 'Other gamepad', index: 1, connected: true, buttons: Array.from({ length: 18 }, () => ({ value: 0, pressed: false })) };
  const root = new Node('main');
  const wrap = new Node('div'); wrap.id = 'ng-gamepad-shortcuts-root'; root.appendChild(wrap);
  const host = new Node('div'); root.appendChild(host);
  const back = { click() { clicked++; } };
  const listeners = {}, timers = new Map(); let counter = 0;
  const document = {
    hidden: false, fullscreenElement: null, body: { classList: { contains: () => false } },
    createElement: tag => new Node(tag), getElementById: id => walk(root, id),
    querySelector: query => query === '.player-header .back-btn' ? back : null,
    addEventListener(event, fn) { listeners['doc:' + event] = fn; }
  };
  const emulator = { started: true, paused: false, isNetplay: false,
    gamepadSelection: ['GameSir_0', 'Other gamepad_1'],
    elements: { parent: host },
    gameManager: { restart() { restarted++; } },
    toggleFullscreen(enter) { toggled.push(enter); document.fullscreenElement = enter ? host : null; },
    setVolume(volume) { setVolumes.push(volume); this.muted = volume === 0; }, volume: 0.5, muted: false,
    settingsMenu: { style: { display: 'none' } }, controlMenu: { style: { display: 'none' } },
    isPopupOpen: () => false
  };
  const window = {
    document, navigator: { getGamepads: () => gamepadIndex === 0 ? [pad, other] : [null, other], userActivation: { get isActive() { return allowedActivation; } } },
    localStorage: { getItem: () => raw, setItem: (_k, v) => { raw = v; } },
    NGI18n: { t: key => key }, NGGamepadManager: { load: () => ({ players: { 0: null, 1: null } }) },
    NGTabPause: { toggle() { paused++; return true; } },
    setInterval(fn) { const id = ++counter; timers.set(id, fn); return id; },
    clearInterval(id) { timers.delete(id); },
    setTimeout(fn) { const id = ++counter; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
    performance: { now() { return clock; } },
    addEventListener(k, fn) { listeners[k] = fn; }
  };
  vm.runInNewContext(fs.readFileSync(SOURCE, 'utf8'), { window, console });
  const api = window.NGGamepadShortcuts;
  const press = (buttons, device = pad) => { device.buttons.forEach((b, i) => { b.pressed = buttons.includes(i); b.value = b.pressed ? 1 : 0; }); api.tickGame(); };
  const attach = () => api.attach(emulator);
  return { api, window, doc: document, root, wrap, host, emulator, pad, other, timers, listeners,
    press, attach, get raw() { return raw; }, get clicked() { return clicked; }, get paused() { return paused; },
    get restarted() { return restarted; }, get toggled() { return toggled; }, get setVolumes() { return setVolumes; },
    time(t) { clock = t; }, activation(v) { allowedActivation = v; }, disconnect() { gamepadIndex = 1; } };
}
const copy = x => JSON.parse(JSON.stringify(x));

test('no configured shortcuts does not create an input polling loop', () => {
  const h = makeHarness(); h.attach();
  assert.equal(h.timers.size, 0);
  h.press([9]); assert.equal(h.paused, 0);
});
test('profiles save one/two buttons only and reject collisions or unknown actions', () => {
  const h = makeHarness();
  assert.equal(h.api.assign('pause', [9]).ok, true);
  assert.equal(h.api.assign('fullscreen', [9, 12]).error, 'conflict');
  assert.equal(h.api.assign('fullscreen', [8, 12]).ok, true);
  assert.equal(h.api.assign('mute', [12]).error, 'conflict');
  assert.equal(h.api.assign('library', [40]).error, 'invalid');
  assert.equal(h.api.assign('what', [1]).error, 'invalid');
  assert.deepEqual(copy(h.api.load().bindings.pause), [9]);
  assert.deepEqual(copy(h.api.load().bindings.fullscreen), [8, 12]);
  assert.equal(h.api.assign('pause', []).ok, true);
  assert.deepEqual(copy(h.api.load().bindings.pause), []);
});
test('pause calls native Tab handler only on new press, never on holds or unrelated pad', () => {
  const h = makeHarness(); h.api.assign('pause', [8]); h.attach();
  h.press([8], h.other); assert.equal(h.paused, 0);
  h.press([8]); h.press([8]); assert.equal(h.paused, 1);
  h.press([]); h.press([8]); assert.equal(h.paused, 2);
  h.api.detach(); assert.equal(h.timers.size, 0);
});
test('fullscreen reuses native EmulatorJS toggle and reports denied activation', () => {
  const h = makeHarness(); h.api.assign('fullscreen', [8, 9]); h.attach();
  h.press([8, 9]); assert.deepEqual(h.toggled, [true]);
  h.press([]); h.press([8, 9]); assert.deepEqual(h.toggled, [true, false]);
  h.press([]); h.activation(false); h.press([8, 9]);
  assert.deepEqual(h.toggled, [true, false]); assert(h.host.children.some(n => n.className === 'ng-gamepad-shortcut-hint'));
});
test('exit requires two distinct presses within 2 seconds and uses existing library link', () => {
  const h = makeHarness(); h.api.assign('library', [10]); h.attach();
  h.time(100); h.press([10]); h.press([10]); assert.equal(h.clicked, 0);
  h.press([]); h.time(2101); h.press([10]); assert.equal(h.clicked, 0);
  h.press([]); h.time(2200); h.press([10]); assert.equal(h.clicked, 1);
  assert.equal(h.timers.size, 0);
});
test('restart requires double press and never runs in netplay', () => {
  const h = makeHarness(); h.api.assign('restart', [5]); h.attach();
  h.time(1); h.press([5]); h.press([]); h.time(500); h.press([5]); assert.equal(h.restarted, 1);
  h.press([]); h.emulator.isNetplay = true; h.time(600); h.press([5]); h.press([]); h.time(700); h.press([5]);
  assert.equal(h.restarted, 1);
});
test('mute and control-menu commands call existing EmulatorJS methods', () => {
  const h = makeHarness(); h.api.assign('mute', [7]); h.api.assign('controls', [6]); h.attach();
  h.press([7]); h.press([]); h.press([7]); assert.deepEqual(h.setVolumes, [0, 0.5]);
  h.press([]); h.press([6]); assert.equal(h.emulator.controlMenu.style.display, '');
  h.press([]); h.press([6]); assert.equal(h.emulator.controlMenu.style.display, 'none');
});
test('modal and vendor settings prevent accidental shortcuts', () => {
  const h = makeHarness(); h.api.assign('pause', [6]); h.attach();
  h.emulator.settingsMenu.style.display = ''; h.press([6]); assert.equal(h.paused, 0);
  h.press([]); h.emulator.settingsMenu.style.display = 'none'; h.press([6]); assert.equal(h.paused, 1);
  h.doc.hidden = true; h.press([]); h.press([6]); assert.equal(h.paused, 1);
});
test('lost controller never falls back to a different player gamepad', () => {
  const h = makeHarness(); h.api.assign('pause', [5]); h.attach(); h.disconnect();
  h.press([5], h.other); assert.equal(h.paused, 0);
});
test('settings UI can capture a pair of gamepad buttons after a neutral release', () => {
  const h = makeHarness(); h.api.mount();
  const buttons = h.wrap.children.find(n => n.className === 'ng-gps-actions').children;
  buttons[0].children[1].click();
  h.api.tickSettings();
  h.pad.buttons[8].pressed = true; h.pad.buttons[8].value = 1;
  h.pad.buttons[10].pressed = true; h.pad.buttons[10].value = 1;
  h.api.tickSettings();
  h.pad.buttons[8].pressed = false; h.pad.buttons[8].value = 0;
  h.pad.buttons[10].pressed = false; h.pad.buttons[10].value = 0;
  h.api.tickSettings();
  assert.deepEqual(copy(h.api.load().bindings.pause), [8,10]);
  assert.equal(h.wrap.children.find(n => n.className === 'ng-gps-actions').children[0].children[0].children[1].textContent, 'B8 + B10');
  buttons[0].children[2].click();
  assert.deepEqual(copy(h.api.load().bindings.pause), []);
});
test('chord capture survives releasing the two buttons one by one', () => {
  const h = makeHarness(); h.api.mount();
  const button = h.wrap.children.find(n => n.className === 'ng-gps-actions').children[1].children[1];
  button.click(); h.api.tickSettings();
  h.pad.buttons[8].pressed = true; h.pad.buttons[8].value = 1;
  h.pad.buttons[9].pressed = true; h.pad.buttons[9].value = 1;
  h.api.tickSettings();
  h.pad.buttons[9].pressed = false; h.pad.buttons[9].value = 0;
  h.api.tickSettings();
  h.pad.buttons[8].pressed = false; h.pad.buttons[8].value = 0;
  h.api.tickSettings();
  assert.deepEqual(copy(h.api.load().bindings.fullscreen), [8, 9]);
});
test('integration is settings/player scoped and preserves native input', () => {
  const m = fs.readFileSync(SOURCE, 'utf8');
  assert.doesNotMatch(m, /dispatchEvent\(new KeyboardEvent|simulateInput\(|setAttribute\('value2'/);
  const kitSpec = path.join(__dirname, '..', '..', 'patches.json');
  if (fs.existsSync(kitSpec)) {
    const spec = JSON.parse(fs.readFileSync(kitSpec, 'utf8'));
    assert.deepEqual(spec.new_files, ['web/controls/gamepad-shortcuts.js', 'tests/gamepad_shortcuts.test.cjs']);
    assert(!('vendor/emulatorjs/data/src/emulator.js' in spec.patches));
    assert(spec.patches['web/settings.js'].some(step => step.new.includes('ng-gamepad-shortcuts-root')));
    assert(spec.patches['web/player.js'].some(step => step.new.includes('NGGamepadShortcuts?.attach')));
  } else {
    const dir = path.resolve(__dirname, '..');
    assert.match(fs.readFileSync(path.join(dir, 'web/settings.js'), 'utf8'), /ng-gamepad-shortcuts-root/);
    assert.match(fs.readFileSync(path.join(dir, 'web/player.js'), 'utf8'), /NGGamepadShortcuts\?\.attach/);
    assert.match(fs.readFileSync(path.join(dir, 'web/player.html'), 'utf8'), /gamepad-shortcuts\.js/);
    assert.doesNotMatch(fs.readFileSync(path.join(dir, 'web/index.html'), 'utf8'), /gamepad-shortcuts\.js/);
  }
});
