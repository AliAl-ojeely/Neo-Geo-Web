'use strict';
const fs = require('node:fs'),
  vm = require('node:vm'),
  assert = require('node:assert/strict'),
  path = require('node:path');
const base = process.argv[2] || 'web';
let scriptLoaded;
const settings = new Map();
const document = {
    // Capture the script-load hook so the test can patch the stub prototype deterministically.
    addEventListener(name, fn) {
      if (name === 'load') scriptLoaded = fn;
    },
    removeEventListener() {}
  },
  window = { addEventListener() {}, dispatchEvent() {} };
class EmulatorJS {
  // Initialize native mappings, emitted inputs, and settings spies before the adapter patches them.
  constructor() {
    this.started = true;
    this.controls = { 0: {}, 1: {} };
    this.defaultControllers = { 0: {}, 1: {} };
    this.gameManager = { simulateInput: (...args) => this.inputs.push(args) };
    this.inputs = [];
    this.settingsMenu = { style: { display: 'none' } };
    this.controlPopup = { parentElement: { parentElement: { getAttribute: () => '' } } };
    this.setupKeys = () => {};
    this.checkGamepadInputs = () => {};
    this.settings = {};
    this.opts = [];
  }

  // Supply a conflicting native BIOS mode to verify replacement by the pinned policy.
  getCoreSettings() {
    return 'fbneo-neogeo-mode = "TEST"\n';
  }

  // Restore a native mapping and sentinel return value before the global profile is applied.
  loadSettings() {
    this.controls[0][0] = { value: 90 };
    return 'previous user mapping';
  }

  // Count fallback calls to the preserved native keyboard handler.
  keyChange(e) {
    this.nativeCalled = (this.nativeCalled || 0) + 1;
    return 'native';
  }

  // Represent gameplay with no active native popup.
  isPopupOpen() {
    return false;
  }

  // Keep native text-entry mode disabled during keyboard integration tests.
  getSettingValue() {
    return 'disabled';
  }

  // Record core-option changes for assertions after native settings load.
  changeSettingOption(...args) {
    this.opts.push(args);
  }
}
const context = {
  window,
  document,
  EmulatorJS,
  localStorage: {
    getItem: k => settings.get(k) || null,
    setItem: (k, v) => settings.set(k, v)
  },
  CustomEvent: class {},
  Date,
  JSON,
  Map,
  WeakMap,
  Set,
  WeakSet,
  console,
  Object
};
vm.runInNewContext(fs.readFileSync('web/languages.js', 'utf8'), context);
vm.runInNewContext(
  fs.readFileSync(path.join(base, 'controls/global-controls.js'), 'utf8'),
  context
);
vm.runInNewContext(fs.readFileSync(path.join(base, 'fbneo-compat.js'), 'utf8'), context);
assert.equal(typeof scriptLoaded, 'function');
scriptLoaded({
  target: { tagName: 'SCRIPT', src: 'http://local.test/vendor/emulatorjs/data/emulator.min.js' }
});
const em = new EmulatorJS();
assert.equal(em.loadSettings(), 'previous user mapping');
assert.equal(
  em.controls[0][0].value,
  65,
  'New global control overrides old EJS per-game mapping'
);
assert.equal(em.controls[1][9].value, 80);
assert.match(em.getCoreSettings(), /MVS_EUR/);
assert.match(em.getCoreSettings(), /allow-patched-romsets = "disabled"/);

// Create a minimal non-repeating gameplay event for the patched native handler.
const ev = (code, type) => ({
  keyCode: code,
  type,
  preventDefault() {},
  repeat: false,
  target: {
    // Represent a noneditable gameplay event target.
    closest() {
      return false;
    }
  }
});
em.keyChange(ev(81, 'keydown'));
assert.deepEqual(em.inputs.slice(-2), [
  [0, 0, 1],
  [0, 8, 1]
]);
em.keyChange(ev(81, 'keyup'));
assert.deepEqual(em.inputs.slice(-2), [
  [0, 0, 0],
  [0, 8, 0]
]);
assert.equal(em.nativeCalled || 0, 0);
em.keyChange(ev(87, 'keydown'));
assert.equal(em.nativeCalled, 1, 'Unassigned W goes to original native handler');
assert.equal(em.opts.filter(x => x[0].startsWith('fbneo-')).length, 2);
console.log(
  'PASS: pinned EmulatorJS prototype hook, BIOS policy, stored EJS mapping override, combined input, native pass-through'
);
