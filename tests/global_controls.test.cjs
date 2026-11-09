'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const base = process.argv[2] || 'web';
const store = new Map(),
  listeners = {};
const window = {
  dispatchEvent() {},

  // Retain window handlers so tests can trigger focus-loss and Tab safety releases.
  addEventListener(type, fn) {
    (listeners['window:' + type] ??= []).push(fn);
  }
};
const document = {
  // Retain document handlers separately from window handlers.
  addEventListener(type, fn) {
    (listeners['document:' + type] ??= []).push(fn);
  },
  hidden: false
};
const storage = { getItem: k => store.get(k) || null, setItem: (k, v) => store.set(k, v) };
const context = {
  window,
  document,
  localStorage: storage,
  CustomEvent: class {
    // Retain the event type expected by profile-change notifications.
    constructor(type) {
      this.type = type;
    }
  },
  Date,
  JSON,
  Set,
  Map,
  WeakMap,
  WeakSet,
  console,
  Object
};
vm.runInNewContext(fs.readFileSync('web/languages.js', 'utf8'), context);
vm.runInNewContext(
  fs.readFileSync(path.join(base, 'controls/global-controls.js'), 'utf8'),
  context
);
const c = window.NGControls;

// Assert one saved player binding with its player and action in the failure label.
const check = (p, k, expected) => assert.equal(c.load().players[p][k], expected, `${p} ${k}`);
for (const [p, entries] of Object.entries({
  0: {
    up: 38,
    down: 40,
    left: 37,
    right: 39,
    a: 65,
    b: 83,
    c: 68,
    d: 70,
    combo_ab: 81,
    combo_abc: 82,
    combo_cd: 69,
    start: 49,
    coin: 51
  },
  1: {
    up: 104,
    down: 98,
    left: 100,
    right: 102,
    a: 74,
    b: 75,
    c: 76,
    d: 80,
    combo_ab: 89,
    combo_abc: 85,
    combo_cd: 73,
    start: 50,
    coin: 52
  }
}))
  for (const [k, v] of Object.entries(entries)) check(p, k, v);
assert.equal(c.DEFAULTS.schema, 2);
assert.equal(c.STORAGE_KEY, 'neogeo-global-controls-v2');
store.set(c.OLD_STORAGE_KEY, 'IMPORTANT: DO NOT OVERWRITE');
assert.equal(c.setKey(0, 'a', 87).ok, true);
assert.equal(store.get(c.OLD_STORAGE_KEY), 'IMPORTANT: DO NOT OVERWRITE');
assert.equal(c.setKey(0, 'a', 81).error, 'KEY_CONFLICT');
assert.equal(c.setKey(0, 'a', 74).error, 'KEY_CONFLICT');
assert.equal(c.setKey(0, 'a', 9).error, 'UNSUPPORTED_KEY');
assert.equal(c.setKey(0, 'a', 65).ok, true);
assert.equal(c.importJSON(c.exportJSON()).ok, true);
let broken = JSON.parse(c.exportJSON());
broken.players[0].a = broken.players[0].b;
assert.equal(c.importJSON(JSON.stringify(broken)).ok, false);
assert.equal(c.importJSON('{broken').ok, false);
assert.equal(c.reset(), true);
assert.equal(c.load().players[0].a, 65);

// Create an active emulator stub with recorded input and key/gamepad setup calls.
function mockEmulator() {
  const calls = [];
  const em = {
    started: true,
    paused: false,
    controls: { 0: { 0: { value: 88, value2: 'BUTTON_2' } }, 1: {} },
    defaultControllers: { 0: { 0: { value: 88, value2: 'BUTTON_2' } }, 1: {} },
    gameManager: {
      // Record player, RetroPad ID, and press state in their original call order.
      simulateInput(p, id, value) {
        calls.push([p, id, value]);
      }
    },

    // Count keyboard setup calls made by the integration.
    setupKeys() {
      this.setupCount = (this.setupCount || 0) + 1;
    },

    // Count gamepad refresh calls made by the integration.
    checkGamepadInputs() {
      this.padCount = (this.padCount || 0) + 1;
    },
    settingsMenu: { style: { display: 'none' } },
    controlPopup: {
      parentElement: {
        parentElement: {
          // Represent a hidden control popup so gameplay key handling remains enabled.
          getAttribute() {
            return '';
          }
        }
      }
    },

    // Keep the emulator popup guard inactive for gameplay tests.
    isPopupOpen() {
      return false;
    },

    // Keep native text keyboard mode disabled for gameplay tests.
    getSettingValue() {
      return 'disabled';
    },
    calls
  };
  return em;
}
const em = mockEmulator();
assert.equal(c.applyToEmulator(em), true);
assert.equal(em.controls[0][0].value, 65);
assert.equal(em.controls[0][8].value, 83);
assert.equal(em.controls[0][1].value, 68);
assert.equal(em.controls[0][9].value, 70);
assert.equal(em.controls[1][0].value, 74);
assert.equal(em.controls[1][8].value, 75);
assert.equal(em.controls[1][1].value, 76);
assert.equal(em.controls[1][9].value, 80);
assert.equal(em.controls[0][0].value2, 'BUTTON_2');
assert.equal(em.controls[0][10].value, 0);
assert.equal(em.controls[0][12].value, 0);
assert.equal(em.controls[0][24].value, 0);
assert.equal(em.setupCount, 1);
assert.equal(em.padCount, 1);

// Read the most recent emitted state for one player and RetroPad button.
const last = (player, id) => em.calls.filter(x => x[0] === player && x[1] === id).at(-1)?.[2];

// Construct a physical-key event, dispatch it to the adapter, and expose consumption results.
function send(k, type = 'keydown', options = {}) {
  const event = {
    keyCode: k,
    code: options.code,
    type,
    repeat: !!options.repeat,
    prevented: false,

    // Record whether the adapter consumed the browser event.
    preventDefault() {
      this.prevented = true;
    },
    target: {
      // Represent a gameplay target outside editable form controls.
      closest() {
        return false;
      }
    },
    ctrlKey: !!options.ctrlKey,
    altKey: false,
    metaKey: false
  };
  const result = c.handleKeyChange(em, event);
  return { event, result };
}
// Q = simultaneously A + B. Both release on keyup.
assert.equal(send(81).result, true);
assert.equal(last(0, 0), 1);
assert.equal(last(0, 8), 1);
assert.equal(send(81, 'keyup').result, true);
assert.equal(last(0, 0), 0);
assert.equal(last(0, 8), 0);
// R = A+B+C; E = C+D.
send(82);
for (const id of [0, 8, 1]) assert.equal(last(0, id), 1);
send(69);
assert.equal(last(0, 9), 1);
send(82, 'keyup');
assert.equal(last(0, 0), 0);
assert.equal(last(0, 8), 0);
assert.equal(last(0, 1), 1, 'C remains held by E');
send(69, 'keyup');
assert.equal(last(0, 1), 0);
assert.equal(last(0, 9), 0);
// Pressing a physical button together with Q must not release it too early.
send(65);
send(81);
send(81, 'keyup');
assert.equal(last(0, 0), 1);
assert.equal(last(0, 8), 0);
send(65, 'keyup');
assert.equal(last(0, 0), 0);
// Q+R overlap: releasing Q must not clear A/B until R is released.
send(81);
send(82);
// Changing UI language must not release or retrigger held macro inputs.
const heldCalls = em.calls.length;
context.NGI18n.setLanguage('ar');
assert.equal(em.calls.length, heldCalls);

send(81, 'keyup');
assert.equal(last(0, 0), 1);
assert.equal(last(0, 8), 1);
assert.equal(last(0, 1), 1);
send(82, 'keyup');
for (const id of [0, 8, 1]) assert.equal(last(0, id), 0);
// Player two Y, U, I; repeated keydown is ignored.
send(89);
assert.equal(last(1, 0), 1);
assert.equal(last(1, 8), 1);
const before = em.calls.length;
send(89, 'keydown', { repeat: true });
assert.equal(em.calls.length, before);
send(89, 'keyup');
assert.equal(last(1, 0), 0);
assert.equal(last(1, 8), 0);
send(85);
for (const id of [0, 8, 1]) assert.equal(last(1, id), 1);
send(85, 'keyup');
send(73);
assert.equal(last(1, 1), 1);
assert.equal(last(1, 9), 1);
send(73, 'keyup');
// P2 numpad uses the physical numpad location even with different NumLock state.
send(38, 'keydown', { code: 'Numpad8' });
assert.equal(last(1, 4), 1);
send(38, 'keyup', { code: 'Numpad8' });
assert.equal(last(1, 4), 0);
// W and O stay unused, unless user remaps explicitly.
assert.equal(send(87).result, false);
assert.equal(send(79).result, false);
// Losing focus releases all held keys.
send(82);
assert.equal(last(0, 1), 1);
for (const fn of listeners['window:blur'] || []) fn();
assert.equal(last(0, 1), 0);
// Tab performs safety release while leaving the separate pause handler in charge.
send(81);
for (const fn of listeners['window:keydown'] || []) fn({ key: 'Tab' });
assert.equal(last(0, 0), 0);
assert.equal(last(0, 8), 0);
assert.equal(send(9).result, false);
assert.equal(send(81, 'keydown', { ctrlKey: true }).result, false);
// In native EJS control capture, do not steal the event.
em.controlPopup.parentElement.parentElement.getAttribute = () => null;
assert.equal(send(81).result, false);
console.log(
  'PASS: default P1/P2, v1 preservation, v2 persistence, conflicts, combos, overlaps, numpad, focus, Tab, UI-prompt isolation'
);
