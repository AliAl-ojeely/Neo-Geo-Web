'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const project = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(project, name), 'utf8');

function event(key, options = {}) {
  let prevented = 0;
  return {
    key, code: key === '+' ? 'NumpadAdd' : 'KeyA',
    repeat: false, target: { closest() { return null; } },
    preventDefault() { prevented++; }, stopImmediatePropagation() {},
    ...options, get prevented() { return prevented; }
  };
}

function fullscreen() {
  const handlers = {};
  let calls = 0;
  const emulator = {
    started: true, settingsMenuOpen: false, settingsMenu: { style: { display: 'none' } },
    controlPopup: { parentElement: { parentElement: { getAttribute() { return 'hidden'; } } } },
    isPopupOpen() { return false; },
    toggleFullscreen(v) { assert.equal(v, true); calls++; }
  };
  const root = {
    EJS_emulator: emulator,
    document: { body: { classList: { contains() { return false; } } }, fullscreenElement: null },
    addEventListener(key, fn) { handlers[key] = fn; }, console
  };
  root.window = root;
  vm.runInNewContext(read('web/controls/plus-fullscreen.js'), root);
  return { root, emulator, handlers, calls: () => calls };
}

test('Plus only starts the existing EmulatorJS fullscreen behavior during a game', () => {
  const h = fullscreen();
  h.handlers.keydown(event('+'));
  assert.equal(h.calls(), 0);
  h.root.NGPlusFullscreen.enable();
  const first = event('+');
  h.handlers.keydown(first);
  assert.equal(first.prevented, 1);
  assert.equal(h.calls(), 1);
  h.handlers.keydown(event('+', { repeat: true }));
  assert.equal(h.calls(), 1);
  h.handlers.keyup(event('+'));
  h.handlers.keydown(event('+', { ctrlKey: true }));
  assert.equal(h.calls(), 1);
  h.handlers.keydown(event('+', { target: { closest: () => ({ tagName: 'INPUT' }) } }));
  assert.equal(h.calls(), 1);
  h.emulator.settingsMenuOpen = true;
  h.handlers.keydown(event('+'));
  assert.equal(h.calls(), 1);
  h.emulator.settingsMenuOpen = false;
  h.root.document.fullscreenElement = {};
  h.handlers.keydown(event('+'));
  assert.equal(h.calls(), 1);
  h.root.document.fullscreenElement = null;
  h.handlers.keyup(event('+'));
  h.root.NGPlusFullscreen.disable();
  h.handlers.keydown(event('+'));
  assert.equal(h.calls(), 1);
});

function classList() {
  const classes = new Set();
  return { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) };
}

test('library motion assigns three variants without hiding cards or requiring IntersectionObserver', () => {
  const handlers = {};
  const nodes = new Map();
  for (const selector of ['.hero-editorial', '.quick-stats', '.collection-heading', '.collection-controls-bar']) {
    nodes.set(selector, { classList: classList(), style: { setProperty() {} }, offsetWidth: 300 });
  }
  const root = {
    document: {
      readyState: 'complete', documentElement: { classList: classList() },
      addEventListener(name, fn) { handlers[name] = fn; }, querySelector: selector => nodes.get(selector)
    },
    matchMedia: () => ({ matches: false }),
    addEventListener(name, fn) { handlers['window:' + name] = fn; }
  };
  vm.runInNewContext(read('web/ui/library-motion.js'), { window: root });
  const cards = Array.from({ length: 3 }, () => ({ classList: classList(), dataset: {}, style: { setProperty() {} } }));
  root.NGLibraryMotion.reveal(cards);
  assert.deepEqual(cards.map(c => c.dataset.ngMotion), ['rise', 'side', 'scale']);
  assert(cards.every(c => c.classList.contains('ng-card-seen')));
  handlers['ng-library-return']();
  assert(nodes.get('.hero-editorial').classList.contains('ng-page-arrive'));
});

test('page-only and player-only integrations remain separate', () => {
  const home = read('web/index.html');
  const player = read('web/player.html');
  assert.match(home, /library-motion\.js/);
  assert.match(home, /id="ng-load-more"/);
  assert.match(home, /id="ng-load-more-btn"/);
  assert.doesNotMatch(home, /plus-fullscreen\.js/);
  assert.match(player, /plus-fullscreen\.js/);
  assert.doesNotMatch(player, /library-motion\.js/);
  assert.match(read('web/player.js'), /NGPlusFullscreen\?\.enable\(\)/);
  assert.match(read('web/player.js'), /NGPlusFullscreen\?\.disable\(\)/);
  assert.match(read('web/library/session-navigation.js'), /ng-library-return/);
  assert.match(read('web/ui/startup-screen.js'), /ng-startup-finished/);
});

test('paging renders only a bounded slice, preserves the full filtered total and resets filters', () => {
  const code = read('web/app.js');
  assert.match(code, /visibleCount:\s*30/);
  assert.match(code, /games\.slice\(start, shown\)/);
  assert.match(code, /state\.visibleCount \+= 30/);
  assert.match(code, /more\.hidden = shown >= games\.length/);
  assert.match(code, /\$\('results'\)\.textContent = games\.length/);
  assert.match(code, /state\.visibleCount = 30/);
  assert.match(code, /NGLibraryMotion\?\.reveal/);
});

test('translation, visual accessibility and existing Tab behavior are preserved', () => {
  const text = read('web/languages.js');
  const css = read('web/style.css');
  assert.match(text, /load_more_games:\s*\{ en:/);
  assert.match(text, /showing_games_count:\s*\{ en:/);
  assert.match(text, /للمتابعة اضغط Tab/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /ng-library-side/);
  assert.match(css, /ng-library-scale/);
  assert.match(css, /ng-library-rise/);
  assert.match(read('web/controls/tab-pause.js'), /function toggle\(\)/);
  assert.match(read('web/controls/esc-exit.js'), /DOUBLE_PRESS_MS = 2000/);
});
