'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const events = new Map();
const element = {
  hidden: true,
  setAttribute() {},
  append() {},
  textContent: '',
  className: ''
};
const stage = {
  // Retain the pause overlay appended by initialization for this DOM fixture.
  append(el) {
    this.child = el;
  }
};
const dom = {
  readyState: 'complete',

  // Expose only the emulator stage used by pause initialization.
  querySelector(selector) {
    return selector === '.emulator-stage' ? stage : null;
  },

  // Report no existing overlay so initialization takes the creation path.
  getElementById() {
    return null;
  },

  // Return a fresh lightweight overlay element for the pause module.
  createElement() {
    return { ...element };
  },
  addEventListener() {}
};
const ctx = {
  window: {
    document: dom,

    // Capture keyboard handlers so tests can invoke the installed listener directly.
    addEventListener(t, h) {
      events.set(t, h);
    },
    EJS_emulator: {
      paused: false,

      // Model the emulator pause operation by changing its observed state.
      pause() {
        this.paused = true;
      },

      // Model the emulator resume operation by clearing its paused state.
      play() {
        this.paused = false;
      }
    },
    console
  }
};
vm.runInNewContext(fs.readFileSync('web/languages.js', 'utf8'), ctx);
vm.runInNewContext(
  fs.readFileSync(
    require('node:path').resolve(__dirname, '../web/controls/tab-pause.js'),
    'utf8'
  ),
  ctx
);
const api = ctx.window.NGTabPause;
assert(api);
api.enable();

// Dispatch a synthetic keydown and return whether browser default handling was prevented.
function send(key, opts = {}) {
  let prevented = false;
  const e = {
    key,
    type: 'keydown',
    repeat: false,
    isComposing: false,

    // Record event interception without requiring a real browser.
    preventDefault() {
      prevented = true;
    },
    stopImmediatePropagation() {},
    ...opts
  };
  events.get('keydown')(e);
  return prevented;
}
assert.equal(send('Tab'), true);
assert.equal(ctx.window.EJS_emulator.paused, true);
assert.equal(send('Tab'), true);
assert.equal(ctx.window.EJS_emulator.paused, false);
assert.equal(send('Tab', { shiftKey: true }), false);
assert.equal(ctx.window.EJS_emulator.paused, false);
api.disable();
assert.equal(send('Tab'), false);
console.log('Tab pause/resume unit PASS');
