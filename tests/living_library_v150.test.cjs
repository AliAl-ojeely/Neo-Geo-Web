'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const repo = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(repo, file), 'utf8');

class Element {
  constructor(tag = 'div', cls = '', id = '') {
    this.tagName = tag.toUpperCase(); this.id = id; this.parentElement = null; this.children = [];
    this.textContent = ''; this.type = ''; this.disabled = false; this.dataset = {}; this.attrs = {};
    this.events = {}; this.values = {}; this.scrolls = []; this.focused = false;
    const classes = new Set(cls.split(/\s+/).filter(Boolean));
    Object.defineProperty(this, 'className', {
      get: () => [...classes].join(' '),
      set: value => { classes.clear(); for (const part of String(value).split(/\s+/).filter(Boolean)) classes.add(part); }
    });
    this.classList = {
      add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c),
      toggle: (c, force) => { const on = force === undefined ? !classes.has(c) : force; on ? classes.add(c) : classes.delete(c); return on; }
    };
    this.style = { setProperty: (key, value) => { this.values[key] = value; } };
  }
  get firstChild() { return this.children[0] || null; }
  append(...children) { for (const child of children) { this.children.push(child); child.parentElement = this; } }
  appendChild(child) { this.append(child); return child; }
  insertBefore(child, before) { const i = this.children.indexOf(before); if (i < 0) this.append(child); else { this.children.splice(i, 0, child); child.parentElement = this; } }
  insertAdjacentElement(_position, child) { this.parentElement?.append(child); }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener(key, callback) { (this.events[key] ||= []).push(callback); }
  click() { for (const callback of this.events.click || []) callback(); }
  focus() { this.focused = true; }
  scrollIntoView(settings) { this.scrolls.push(settings); }
  contains(element) { return this === element || this.children.some(c => c.contains(element)); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const match = element => selector.startsWith('#') ? element.id === selector.slice(1) :
      selector.startsWith('.') ? element.classList.contains(selector.slice(1)) : false;
    const found = [];
    const visit = element => { for (const child of element.children) { if (match(child)) found.push(child); visit(child); } };
    visit(this);
    return found;
  }
  closest(selector) {
    for (let node = this; node; node = node.parentElement)
      if (selector.split(',').some(s => node.classList.contains(s.trim().slice(1)))) return node;
    return null;
  }
  getBoundingClientRect() { return { left: 0, top: 0, width: 200, height: 100 }; }
}

function harness({ reduced = false, coarse = false, storage = new Map(), home = true, cards = 3 } = {}) {
  const body = new Element('body', home ? 'home-page' : 'settings-page');
  const hero = new Element('section', 'hero-editorial');
  const copy = new Element('div', 'hero-copy'); hero.append(copy);
  const art = new Element('div', 'hero-art'); hero.append(art);
  const heading = new Element('div', 'collection-heading');
  const grid = new Element('div', 'game-grid', 'game-grid');
  const stat1 = new Element('strong', '', 'stat-games'); stat1.textContent = '—';
  const stat2 = new Element('strong', '', 'stat-shots'); stat2.textContent = '—';
  body.append(hero, heading, grid, stat1, stat2);
  function addCard(name) {
    const card = new Element('article', 'game-card');
    const link = new Element('a', 'game-title'); link.textContent = name;
    card.append(link); grid.append(card); return card;
  }
  for (let i = 0; i < cards; i++) addCard('Game ' + (i + 1));
  const docEvents = {}, winEvents = {}, raf = new Map(), timers = new Map(), observers = [];
  let id = 0;
  const document = {
    body, hidden: false, readyState: 'complete',
    getElementById: id => body.querySelector('#' + id), querySelector: s => body.querySelector(s),
    createElement: tag => new Element(tag), addEventListener: (e, f) => { docEvents[e] = f; }
  };
  const window = {
    document, NGI18n: { t: (key, params) => key + (params?.title ? ':' + params.title : '') },
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) },
    matchMedia: q => ({ matches: q.includes('reduced-motion') ? reduced : coarse, addEventListener() {} }),
    addEventListener: (e, f) => { winEvents[e] = f; },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe(node) { this.target = node; }
      disconnect() {}
    },
    requestAnimationFrame: f => { const n = ++id; raf.set(n, f); return n; },
    cancelAnimationFrame: n => raf.delete(n),
    setTimeout: f => { const n = ++id; timers.set(n, f); return n; },
    clearTimeout: n => timers.delete(n)
  };
  const source = read('web/ui/living-library.js');
  vm.runInNewContext(source, { window, console }, { filename: 'living-library.js' });
  const flushFrames = (now = 100) => { const list = [...raf.values()]; raf.clear(); list.forEach(f => f(now)); };
  return { body, grid, hero, art, copy, heading, stat1, stat2, addCard, document, window, storage,
    docEvents, winEvents, raf, timers, observers, flushFrames };
}

test('home only: player/settings do not mount living-library decoration', () => {
  const h = harness({ home: false });
  assert.equal(h.window.NGLivingLibrary, undefined);
  assert.equal(h.body.classList.contains('ng-living-ready'), false);
});

test('mounts one home-specific kicker, toolbar, status and decorative orbit', () => {
  const h = harness();
  assert(h.body.classList.contains('ng-living-ready'));
  assert(h.body.querySelector('#ng-living-kicker'));
  assert(h.body.querySelector('#ng-living-pick'));
  assert(h.body.querySelector('#ng-living-motion'));
  assert(h.body.querySelector('#ng-living-feedback'));
  assert(h.art.querySelector('.ng-living-orbit'));
  assert.equal(h.body.querySelectorAll('#ng-living-motion').length, 1);
});

test('pick highlights one visible card, focuses the real game link and never starts a game', () => {
  const h = harness({ cards: 4 });
  assert.equal(h.window.NGLivingLibrary.surpriseMe(), true);
  const picked = h.grid.children.filter(c => c.classList.contains('ng-living-picked'));
  assert.equal(picked.length, 1);
  assert.equal(picked[0].querySelector('.game-title').focused, true);
  assert.equal(picked[0].scrolls.length, 1);
  assert.match(h.body.querySelector('#ng-living-feedback').textContent, /^living_library\.picked/);
  assert.equal(h.storage.size, 0);
});

test('empty results disable picker; after filtering the picker uses current cards', () => {
  const h = harness({ cards: 0 });
  const button = h.body.querySelector('#ng-living-pick');
  assert.equal(button.disabled, true);
  assert.equal(h.window.NGLivingLibrary.surpriseMe(), false);
  assert.match(h.body.querySelector('#ng-living-feedback').textContent, /no_results/);
  const hiddenCard = h.addCard('Old hidden result');
  hiddenCard.hidden = true;
  const visible = h.addCard('Newly filtered result');
  h.observers.find(o => o.target === h.grid).callback();
  assert.equal(button.disabled, false);
  assert.equal(h.window.NGLivingLibrary.surpriseMe(), true);
  assert.equal(hiddenCard.querySelector('.game-title').focused, false);
  assert.equal(visible.querySelector('.game-title').focused, true);
});

test('pick highlight disappears on timeout without changing a library item', () => {
  const h = harness({ cards: 1 });
  h.window.NGLivingLibrary.surpriseMe();
  const card = h.grid.children[0];
  assert(card.classList.contains('ng-living-picked'));
  [...h.timers.values()][0]();
  assert.equal(card.classList.contains('ng-living-picked'), false);
});

test('motion toggle saves only its independent key and disables movement', () => {
  const h = harness();
  h.body.querySelector('#ng-living-motion').click();
  assert.equal(h.storage.get('ng-living-library-motion-v1'), 'off');
  assert(h.body.classList.contains('ng-living-reduced'));
  assert.equal(h.window.NGLivingLibrary.canAnimate(), false);
  h.body.querySelector('#ng-living-motion').click();
  assert.equal(h.storage.get('ng-living-library-motion-v1'), 'on');
  assert.equal(h.window.NGLivingLibrary.canAnimate(), true);
});

test('saved motion choice survives a fresh page instance', () => {
  const storage = new Map([['ng-living-library-motion-v1', 'off']]);
  const h = harness({ storage });
  assert.equal(h.window.NGLivingLibrary.canAnimate(), false);
  assert.equal(h.body.querySelector('#ng-living-motion').attrs['aria-pressed'], 'false');
});

test('system reduced-motion overrides animated selection and count-up', () => {
  const h = harness({ reduced: true, cards: 1 });
  assert.equal(h.window.NGLivingLibrary.canAnimate(), false);
  assert.equal(h.body.querySelector('#ng-living-motion').disabled, true);
  h.window.NGLivingLibrary.surpriseMe();
  assert.equal(h.grid.children[0].scrolls[0].behavior, 'auto');
  h.stat1.textContent = '191';
  assert.equal(h.raf.size, 0);
  h.body.querySelector('#ng-living-motion').click();
  assert(h.body.classList.contains('ng-living-reduced'));
});

test('reduced choice is resilient if localStorage is blocked', () => {
  const h = harness();
  h.window.localStorage.setItem = () => { throw Error('blocked'); };
  assert.doesNotThrow(() => h.body.querySelector('#ng-living-motion').click());
  assert(h.body.classList.contains('ng-living-reduced'));
});

test('cross-tab motion preference and language change refresh only UI', () => {
  const h = harness();
  h.storage.set('ng-living-library-motion-v1', 'off');
  h.winEvents.storage({ key: 'ng-living-library-motion-v1' });
  assert(h.body.classList.contains('ng-living-reduced'));
  h.docEvents['ng-language-changed']();
  assert.equal(h.body.querySelector('#ng-living-pick').textContent, 'living_library.pick');
});

test('one passive delegated mouse move schedules at most one frame', () => {
  const h = harness({ cards: 1 });
  const target = h.grid.children[0];
  h.docEvents.pointermove({ target, clientX: 125, clientY: 25, pointerType: 'mouse' });
  h.docEvents.pointermove({ target, clientX: 150, clientY: 35, pointerType: 'mouse' });
  assert.equal(h.raf.size, 1);
  h.flushFrames();
  assert.equal(target.values['--ng-living-x'], '75%');
  assert.equal(target.values['--ng-living-y'], '35%');
});

test('touch/coarse pointer never starts a rendering loop', () => {
  const h = harness({ coarse: true });
  h.docEvents.pointermove({ target: h.grid.children[0], clientX: 25, clientY: 25, pointerType: 'touch' });
  assert.equal(h.raf.size, 0);
});

test('count-up reads actual numeric total, is bounded and never animates placeholders', () => {
  const h = harness();
  assert.equal(h.raf.size, 0);
  h.stat1.textContent = '191';
  h.observers.find(o => o.target === h.stat1).callback();
  assert.equal(h.raf.size, 1);
  h.flushFrames(100);
  h.flushFrames(900);
  assert.equal(h.stat1.textContent, '191');
  assert.equal(h.raf.size, 0);
  h.stat2.textContent = '—';
  h.observers.find(o => o.target === h.stat2).callback();
  assert.equal(h.raf.size, 0);
});

test('release hooks preserve existing app.js library rendering and input handlers', () => {
  const home = read('web/index.html');
  const player = read('web/player.html');
  const settings = read('web/settings.html');
  const app = read('web/app.js');
  assert.match(home, /assets\/ui\/living-library\.css\?v=1\.5\.0/);
  assert.match(home, /assets\/ui\/living-library\.js\?v=1\.5\.0/);
  assert(home.indexOf('app.js" defer') < home.indexOf('living-library.js?v=1.5.0'));
  assert.doesNotMatch(player, /living-library\./);
  assert.doesNotMatch(settings, /living-library\./);
  assert.match(app, /NGLibraryMotion\?\.reveal/);
  assert.match(app, /games\.slice\(start, shown\)/);
  assert.match(app, /state\.visibleCount \+= 30/);
});

test('the existing bilingual catalog holds every new message in Arabic and English', () => {
  const lang = read('web/languages.js');
  const block = lang.split('    living_library: {')[1]?.split('    },')[0];
  assert(block);
  for (const key of ['kicker', 'pick', 'pick_hint', 'no_results', 'picked', 'motion_on', 'motion_off', 'system_reduced', 'motion_label']) {
    assert.match(block, new RegExp(key + ': \\{ en:'));
    assert.match(block, new RegExp(key + ': .*ar:'));
  }
});

test('presentation has accessible fallback, modest motion and no external requests', () => {
  const css = read('web/ui/living-library.css');
  const js = read('web/ui/living-library.js');
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /\.home-page\.ng-living-reduced/);
  assert.match(css, /@media \(hover: none\)/);
  assert.match(css, /\.ng-living-actions button:focus-visible/);
  assert.match(js, /aria-live/);
  assert.doesNotMatch(js, /\bfetch\s*\(|XMLHttpRequest|WebSocket|Gamepad|EJS_emulator|saveSettings|dispatchEvent\(.*key/);
});
