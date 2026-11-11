'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

function setup() {
  const listeners = new Map();
  const docListeners = new Map();
  const timers = new Map();
  let counter = 0;
  let clock = 0;
  let clicks = 0;
  let fallbackNavigations = 0;
  let lang = 'en';
  function makeElement() {
    return {
      parentNode: null,
      children: [],
      hidden: false,
      attributes: {},
      setAttribute(k, v) { this.attributes[k] = v; },
      appendChild(child) {
        if (child.parentNode) child.parentNode.children = child.parentNode.children.filter(x => x !== child);
        this.children.push(child);
        child.parentNode = this;
      },
      append(child) { this.appendChild(child); },
      closest() { return null; },
      getClientRects() { return []; }
    };
  }
  const stage = makeElement();
  const full = makeElement();
  const back = {click() { clicks++; }};
  const doc = {
    fullscreenElement: null,
    body: {classList: {contains() { return false; }}},
    querySelector(q) {
      if (q === '.emulator-stage') return stage;
      if (q === '.player-header .back-btn') return back;
      return null;
    },
    createElement: makeElement,
    addEventListener(name, fn) { docListeners.set(name, fn); }
  };
  const win = {
    document: doc,
    NGI18n: {t() { return lang === 'ar' ? 'اضغط Esc مرة ثانية للعودة إلى المكتبة' : 'Press Esc again to return to the library'; }},
    NG_BASE: 'https://example.test/Neo-Geo-Web/',
    location: {href: 'https://example.test/Neo-Geo-Web/player.html?rom=kof98.zip', assign() { fallbackNavigations++; }},
    performance: {now() { return clock; }},
    addEventListener(name, fn, capture) {listeners.set(name, fn); if (name === 'keydown' || name === 'keyup') assert.equal(capture, true);},
    getComputedStyle() {return {display: 'none', visibility: 'hidden'};},
    setTimeout(fn, ms) {const id = ++counter; timers.set(id, {fn, when: clock + ms}); return id;},
    clearTimeout(id) {timers.delete(id);}
  };
  vm.runInNewContext(read('web/controls/esc-exit.js'), {window: win, document: doc, Date, URL, console});
  function event(key = 'Escape', options = {}) {
    let prevented = 0, stopped = 0;
    const e = {
      key,
      repeat: false,
      target: {closest() {return null;}},
      preventDefault() {prevented++;},
      stopImmediatePropagation() {stopped++;},
      ...options
    };
    return {e, get prevented() {return prevented;}, get stopped() {return stopped;}};
  }
  function fire(name, ev = event()) {listeners.get(name)(ev.e); return ev;}
  function advance(ms) {
    clock += ms;
    for (const [id, t] of [...timers]) if (t.when <= clock) {timers.delete(id); t.fn();}
  }
  const hint = () => stage.children.find(x => x.id === 'ng-esc-exit-hint') || full.children.find(x => x.id === 'ng-esc-exit-hint');
  return {
    win, doc, stage, full, hint, fire, event, advance,
    setLang(value) {lang = value; docListeners.get('ng-language-changed')();},
    triggerDocumentEvent(name) {docListeners.get(name)();},
    get clicks() {return clicks;},
    get fallbackNavigations() {return fallbackNavigations;}
  };
}

test('feature is player-only, loaded before player bootstrap, and localized centrally', () => {
  const player = read('web/player.html');
  const library = read('web/index.html');
  const settings = read('web/settings.html');
  assert.match(player, /src="\/assets\/controls\/esc-exit\.js" defer/);
  assert.ok(player.indexOf('/assets/controls/esc-exit.js') < player.indexOf('/assets/player.js'));
  assert.doesNotMatch(library, /esc-exit\.js/);
  assert.doesNotMatch(settings, /esc-exit\.js/);
  const bootstrap = read('web/player.js');
  assert.match(bootstrap, /window\.NGEscExit\?\.enable\(\)/);
  assert.match(bootstrap, /window\.NGEscExit\?\.disable\(\)/);
  assert.match(read('web/languages.js'), /press_esc_again_to_return_to_library:\s*\{\s*en: '[^']+',\s*ar: '[^']+'/);
  assert.match(read('web/style.css'), /\.ng-esc-exit-hint\s*\{/);
});

test('double distinct Escape within 2 seconds uses existing library back link', () => {
  const x = setup();
  assert.equal(x.fire('keydown').prevented, 0);
  x.win.NGEscExit.enable();
  const first = x.fire('keydown');
  assert.equal(first.prevented, 1);
  assert.equal(first.stopped, 1);
  assert.equal(x.clicks, 0);
  assert.equal(x.hint().hidden, false);
  x.fire('keyup');
  x.advance(950);
  x.fire('keydown');
  assert.equal(x.clicks, 1);
  assert.equal(x.fallbackNavigations, 0);
  assert.equal(x.hint().hidden, true);
  x.fire('keyup');
  x.fire('keydown');
  assert.equal(x.clicks, 1);
});

test('holding Escape or OS-generated autorepeat cannot count twice', () => {
  const x = setup();
  x.win.NGEscExit.enable();
  x.fire('keydown');
  x.fire('keydown', x.event('Escape', {repeat: true}));
  x.fire('keydown');
  assert.equal(x.clicks, 0);
  x.fire('keyup');
  x.fire('keydown');
  assert.equal(x.clicks, 1);
});

test('slow presses expire; first press hint disappears after two seconds', () => {
  const x = setup();
  x.win.NGEscExit.enable();
  x.fire('keydown');
  x.fire('keyup');
  x.advance(2100);
  assert.equal(x.hint().hidden, true);
  x.fire('keydown');
  assert.equal(x.clicks, 0);
  assert.equal(x.hint().hidden, false);
});

test('dialog, text input, modifiers, and emulator popup retain Escape', () => {
  const x = setup();
  x.win.NGEscExit.enable();
  x.doc.body.classList.contains = () => true;
  assert.equal(x.fire('keydown').prevented, 0);
  x.doc.body.classList.contains = () => false;
  assert.equal(x.fire('keydown', x.event('Escape', {target:{closest(){return {};}}})).prevented, 0);
  assert.equal(x.fire('keydown', x.event('Escape', {ctrlKey:true})).prevented, 0);
  x.win.EJS_emulator = {isPopupOpen: () => true};
  assert.equal(x.fire('keydown').prevented, 0);
  assert.equal(x.clicks, 0);
});

test('disable after game exit stops interception and clears pending press', () => {
  const x = setup();
  x.win.NGEscExit.enable();
  x.fire('keydown');
  x.win.NGEscExit.disable();
  assert.equal(x.hint().hidden, true);
  x.fire('keyup');
  assert.equal(x.fire('keydown').prevented, 0);
  assert.equal(x.clicks, 0);
});

test('live language changes and fullscreen reparenting preserve prompt', () => {
  const x = setup();
  x.win.NGEscExit.enable();
  x.fire('keydown');
  assert.match(x.hint().textContent, /Press Esc/);
  x.setLang('ar');
  assert.match(x.hint().textContent, /اضغط Esc/);
  x.doc.fullscreenElement = x.full;
  x.triggerDocumentEvent('fullscreenchange');
  assert.equal(x.hint().parentNode, x.full);
  assert.equal(x.hint().hidden, false);
  x.doc.fullscreenElement = null;
  x.triggerDocumentEvent('fullscreenchange');
  assert.equal(x.hint().parentNode, x.stage);
});

test('Escape does not steal ordinary keys or exit before game startup', () => {
  const x = setup();
  assert.equal(x.fire('keydown').stopped, 0);
  x.win.NGEscExit.enable();
  const tab = x.fire('keydown', x.event('Tab'));
  assert.equal(tab.prevented, 0);
  assert.equal(tab.stopped, 0);
  x.fire('keydown');
  assert.equal(x.clicks, 0);
});
