'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'web/controls/gamepad-manager.js'), 'utf8');

function fixture() {
  const store = new Map();
  const elements = new Map(), listeners = new Map(), intervals = new Map();
  const gamepads = [];
  let nextInterval = 1, storageFails = false;
  class Node {
    constructor(tag = 'div') {
      this.tagName = tag; this.children = []; this.value = ''; this.textContent = '';
      this.events = new Map(); this.hidden = false;
    }
    set id(value) { this._id = value; elements.set(value, this); }
    get id() { return this._id; }
    appendChild(node) { this.children.push(node); return node; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = [...nodes]; }
    addEventListener(name, handler) { this.events.set(name, handler); }
    setAttribute(name, value) { this[name] = value; }
  }
  const root = new Node(); root.id = 'ng-gamepad-manager-root';
  const context = {
    document: { getElementById: id => elements.get(id) || null,
      createElement: tag => new Node(tag), hidden: false },
    navigator: { getGamepads: () => gamepads },
    localStorage: { getItem: k => { if (storageFails) throw Error('blocked'); return store.get(k) || null; },
      setItem: (k, value) => { if (storageFails) throw Error('blocked'); store.set(k, value); } },
    NGI18n: { t: key => key },
    setInterval: fn => { const id = nextInterval++; intervals.set(id, fn); return id; },
    clearInterval: id => intervals.delete(id),
    setTimeout: fn => fn(),
    addEventListener: (name, handler) => listeners.set(name, handler),
    Array, JSON, Map, Set, Object, Number, String, console
  };
  vm.runInNewContext(source, context, { filename: 'gamepad-manager.js' });
  const manager = context.NGGamepadManager;
  return { context, manager, gamepads, root, store, elements, listeners, intervals,
    failStorage: () => { storageFails = true; },
    removeFrame: () => elements.delete('ng-gamepad-manager-root'),
    pad: (id, index, button = 0) => ({ id, index, connected: true,
      buttons: [{ pressed: button > 0.5, value: button }, { pressed: false, value: 0 }],
      axes: [0, 0], mapping: 'standard' }) };
}

test('no saved profile preserves native EmulatorJS assignments', () => {
  const f = fixture(); const native = ['Alpha_0', 'Beta_1', '', ''];
  const em = { gamepadSelection: native, gamepad: { gamepads: [] } };
  f.manager.attach(em);
  assert.deepEqual(native, ['Alpha_0', 'Beta_1', '', '']);
  assert.equal(f.manager.load().players[0], null);
  assert.equal(f.intervals.size, 0);
});

test('discover controllers and assign one to each player with stable saved IDs', () => {
  const f = fixture(); f.gamepads.push(f.pad('Alpha', 4), f.pad('Beta', 9));
  const devices = f.manager.devices();
  assert.equal(devices.length, 2);
  assert.equal(f.manager.choose(0, devices[1].key), true);
  assert.equal(f.manager.choose(1, devices[0].key), true);
  assert.deepEqual(JSON.parse(JSON.stringify(f.manager.load().players)), {
    0: { id: 'Beta', ordinal: 0 }, 1: { id: 'Alpha', ordinal: 0 }
  });
  assert.equal(f.store.size, 1);
  assert.doesNotMatch([...f.store.values()][0], /buttons|axes|rom|bios/i);
});

test('two identical models have distinct ordinals; duplicate assignment is rejected', () => {
  const f = fixture(); f.gamepads.push(f.pad('Same Model', 2), f.pad('Same Model', 8));
  const [a, b] = f.manager.devices();
  assert.notEqual(a.key, b.key);
  assert.equal(f.manager.choose(0, a.key), true);
  assert.equal(f.manager.choose(1, a.key), false);
  assert.equal(f.manager.choose(1, b.key), true);
  assert.equal(f.manager.load().players[1].ordinal, 1);
});

test('invalid schema and malicious identifiers cannot enter assignments', () => {
  const f = fixture();
  f.store.set(f.manager.STORAGE_KEY, JSON.stringify({ schema: 100, players: { 0: { id: 'evil' } } }));
  assert.equal(f.manager.load().players[0], null);
  const bad = f.manager.normalize({ schema: 1, players: {
    0: { id: 'x'.repeat(300), ordinal: 0 }, 1: { id: 'OK', ordinal: -2 }
  } });
  assert.equal(bad.players[0], null);
  assert.equal(bad.players[1], null);
});

test('unavailable localStorage is graceful and never modifies the game', () => {
  const f = fixture(); f.failStorage();
  assert.equal(f.manager.load().players[0], null);
  assert.equal(f.manager.save({ schema: 1, players: {} }), false);
  assert.equal(f.manager.choose(0, 'unknown'), false);
});

test('native player assignment applies on game startup without replacing input handlers', () => {
  const f = fixture(); f.gamepads.push(f.pad('Blue', 0), f.pad('Red', 1));
  const pads = f.manager.devices();
  f.manager.choose(0, pads[1].key);
  f.manager.choose(1, pads[0].key);
  let calls = 0;
  const em = { gamepadSelection: ['Blue_0', 'Red_1', '', ''],
    gamepad: { gamepads: [{ id: 'Blue', index: 0 }, { id: 'Red', index: 1 }] },
    updateGamepadLabels() { calls++; },
    gamepadEvent() { return 99; } };
  const original = em.gamepadEvent;
  f.manager.attach(em);
  assert.deepEqual(em.gamepadSelection.slice(0, 2), ['Red_1', 'Blue_0']);
  assert.equal(em.gamepadEvent, original);
  assert.equal(calls, 1);
  assert.equal(f.intervals.size, 1);
  f.manager.detach();
  assert.equal(f.intervals.size, 0);
});

test('disconnected explicit device never silently selects a different gamepad', () => {
  const f = fixture(); f.gamepads.push(f.pad('Blue', 0));
  f.manager.choose(0, f.manager.devices()[0].key);
  const em = { gamepadSelection: ['Other_5', 'Blue_0', '', ''], gamepad: { gamepads: [] },
    updateGamepadLabels() {} };
  f.manager.attach(em);
  assert.equal(em.gamepadSelection[0], '');
  // The original automatic P2 can stay assigned if the user's P1 hardware is absent.
  assert.equal(em.gamepadSelection[1], 'Blue_0');
  f.manager.detach();
});

test('reconnection with a new browser index resolves the same identity', () => {
  const f = fixture(); f.gamepads.push(f.pad('Reconnected', 0));
  f.manager.choose(0, f.manager.devices()[0].key);
  const em = { gamepadSelection: ['', '', '', ''], gamepad: { gamepads: [] },
    updateGamepadLabels() {} };
  f.manager.attach(em);
  assert.equal(em.gamepadSelection[0], '');
  em.gamepad.gamepads = [{ id: 'Reconnected', index: 6 }];
  f.listeners.get('gamepadconnected')();
  assert.equal(em.gamepadSelection[0], 'Reconnected_6');
  f.manager.detach();
});

test('native gamepad popup receives no synthetic button or keyboard injection', () => {
  const f = fixture(); f.gamepads.push(f.pad('Controller', 0));
  f.manager.choose(1, f.manager.devices()[0].key);
  const em = { gamepadSelection: ['', '', '', ''], gamepad: { gamepads: [{id:'Controller',index:0}] },
    controls: { 0: { 0: { value: 65, value2: 'BUTTON_2' } }, 1: {} },
    gameManager: { simulateInput() { throw Error('must not simulate input'); } }, updateGamepadLabels() {} };
  f.manager.attach(em);
  assert.equal(em.gamepadSelection[1], 'Controller_0');
  assert.equal(em.controls[0][0].value, 65);
  assert.equal(em.controls[0][0].value2, 'BUTTON_2');
  f.manager.detach();
});

test('settings UI tests buttons/axes without HTML injection and stops polling when closed', () => {
  const f = fixture(); f.gamepads.push(f.pad('<script>unsafe</script>', 5, 1));
  f.gamepads[0].axes[0] = -0.7;
  f.manager.mount();
  assert.equal(f.intervals.size, 1);
  const p1 = f.elements.get('ng-gamepad-p1');
  assert.equal(p1.children.length, 2);
  assert.equal(p1.children[1].textContent, '<script>unsafe</script> [6]');
  assert.equal(f.elements.get('ng-gamepad-tester-output').textContent.includes('B0'), true);
  assert.equal(f.elements.get('ng-gamepad-tester-output').textContent.includes('A0: -0.70'), true);
  p1.value = f.manager.devices()[0].key;
  p1.events.get('change')();
  assert.equal(f.manager.load().players[0].id, '<script>unsafe</script>');
  f.removeFrame();
  f.manager.mount();
  assert.equal(f.intervals.size, 0);
});

test('script is loaded only in Settings and Player; no vendor file is patched', () => {
  const root = path.join(__dirname, '..');
  const read = p => fs.readFileSync(path.join(root, p), 'utf8');
  assert.match(read('web/settings.html'), /controls\/gamepad-manager\.js\?v=1\.4\.0/);
  assert.match(read('web/player.html'), /controls\/gamepad-manager\.js\?v=1\.4\.0/);
  assert.match(read('web/settings.js'), /NGGamepadManager\?\.mount\?\.\(\)/);
  assert.match(read('web/player.js'), /NGGamepadManager\?\.attach\?\.\(window\.EJS_emulator\)/);
  assert.match(read('web/player.js'), /NGGamepadManager\?\.detach\?\.\(\)/);
  assert.doesNotMatch(read('web/index.html'), /gamepad-manager\.js/);
  assert.doesNotMatch(source, /simulateInput\s*\(|\bModule\s*\.|\.controls\s*\[/);
});
