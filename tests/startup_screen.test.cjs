'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const read = p => fs.readFileSync(p, 'utf8');

function create(store = new Map(), options = {}) {
  const classes = new Set(), attrs = new Map(), events = new Map(), timers = [];
  const screen = { hidden: false };
  const html = {
    classList: { add: key => classes.add(key), remove: key => classes.delete(key) },
    setAttribute: (key, value) => attrs.set(key, value),
    removeAttribute: key => attrs.delete(key)
  };
  const doc = {
    documentElement: html,
    readyState: options.readyState || 'loading',
    getElementById: id => id === 'ng-startup-screen' ? screen : null,
    addEventListener: (event, callback) => events.set(event, callback)
  };
  const root = {
    document: doc,
    sessionStorage: options.noStorage ? {
      getItem() { throw Error('denied'); },
      setItem() { throw Error('denied'); }
    } : {
      getItem: key => store.get(key) || null,
      setItem: (key, value) => store.set(key, value)
    },
    setTimeout: (callback, ms) => { timers.push({ callback, ms }); return 1; },
    addEventListener: (event, callback) => events.set(event, callback)
  };
  vm.runInNewContext(read('web/ui/startup-screen.js'), {window: root});
  return {root, classes, attrs, events, timers, screen, store};
}

test('index entry only and no changes to player or settings entrypoints', () => {
  const home = read('web/index.html');
  assert.match(home, /<script src="\/assets\/ui\/startup-screen\.js"><\/script>/);
  assert.match(home, /id="ng-startup-screen"/);
  assert.match(home, /data-i18n-text="startup\.loading"/);
  assert.match(home, /data-i18n-text="startup\.preparing_arcade"/);
  assert.equal((home.match(/ng-startup-dot"/g) || []).length, 12);
  for (const page of ['web/player.html', 'web/settings.html'])
    assert.doesNotMatch(read(page), /startup-screen/);
});

test('covers early and removes overlay exactly after the scheduled 3000 ms', () => {
  const env = create();
  assert(env.classes.has('ng-startup-pending'));
  assert.equal(env.attrs.get('aria-busy'), 'true');
  assert.equal(env.timers.length, 0);
  env.events.get('DOMContentLoaded')();
  assert.equal(env.timers.length, 1);
  assert.equal(env.timers[0].ms, 3000);
  assert(env.classes.has('ng-startup-pending'));
  env.timers[0].callback();
  assert(!env.classes.has('ng-startup-pending'));
  assert(!env.attrs.has('aria-busy'));
  assert.equal(env.screen.hidden, true);
});

test('once per browser tab and no delay when returning from a game', () => {
  const storage = new Map();
  const first = create(storage);
  assert.equal(storage.get('neogeo-startup-loading-seen-v1'), '1');
  assert(first.classes.has('ng-startup-pending'));
  const second = create(storage);
  assert(!second.classes.has('ng-startup-pending'));
  assert.equal(second.timers.length, 0);
  assert.equal(create(new Map()).classes.has('ng-startup-pending'), true);
});

test('blocked sessionStorage still runs without crashing', () => {
  const env = create(new Map(), {noStorage: true, readyState: 'complete'});
  assert(env.classes.has('ng-startup-pending'));
  assert.equal(env.timers[0].ms, 3000);
});

test('pagehide cleans up and cannot leave a splash on browser back cache', () => {
  const env = create();
  env.events.get('DOMContentLoaded')();
  env.events.get('pagehide')();
  assert(!env.classes.has('ng-startup-pending'));
  env.timers[0].callback();
  assert(!env.classes.has('ng-startup-pending'));
});

test('localized, reduced-motion-safe dotted circle and no blocking of library preparation', () => {
  const css = read('web/style.css');
  const languages = read('web/languages.js');
  const app = read('web/app.js');
  assert.match(css, /\.ng-startup-screen\s*\{[\s\S]*?display:\s*none;/);
  assert.match(css, /html\.ng-startup-pending \.ng-startup-screen:not\(\[hidden\]\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@keyframes ng-startup-dot-pulse/);
  assert.match(languages, /startup:\s*\{/);
  assert.match(languages, /loading:\s*\{ en: 'Loading', ar: 'جارٍ التحميل' \}/);
  assert.match(app, /load\(\);\s*$/);
  const entry = read('web/index.html');
  assert(entry.indexOf('startup-screen.js') < entry.indexOf('src="/assets/app.js"'));
});
