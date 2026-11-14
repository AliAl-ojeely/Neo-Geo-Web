'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const read = name => fs.readFileSync(name, 'utf8');

// Home entry is the only screen with this guide and it does not replace the welcome modal.
test('home-only circular keyboard trigger and verified shared modal structure', () => {
  const html = read('web/index.html');
  assert.match(html, /class="header-actions">\s*<button id="ng-shortcuts-trigger"/);
  assert.match(html, /class="ng-shortcuts-trigger"/);
  assert.match(html, /aria-haspopup="dialog"/);
  assert.match(html, /aria-controls="ng-shortcuts-modal"/);
  assert.match(html, /data-i18n-attrs="[^\n]*shortcuts\.open/);
  assert.match(html, /src="\/assets\/ui\/shortcut-guide\.js" defer/);
  assert.match(html, /id="ng-shortcuts-modal" class="first-run-overlay ng-modal-overlay ng-shortcuts-modal"/);
  assert.match(html, /class="first-run-panel ng-modal-panel ng-shortcuts-panel"/);
  assert.match(html, /class="first-run-actions ng-modal-actions"/);
  assert.match(html, /data-shortcuts-close/);
  assert.match(html, /data-shortcuts-dismiss/);
  assert.match(html, /id="first-run-guide"/);
  assert.doesNotMatch(read('web/player.html'), /ng-shortcuts-trigger|ng-shortcuts-modal/);
  assert.doesNotMatch(read('web/settings.html'), /ng-shortcuts-trigger|ng-shortcuts-modal/);
});

function environment(guideHidden = true) {
  const triggerEvents = new Map(), modalEvents = new Map(), closeEvents = new Map();
  const backdropEvents = new Map(), rootEvents = new Map(), documentEvents = new Map();
  const bodyClasses = new Set(), modalClasses = new Set(), attributes = new Map();
  let restored = 0, closeFocus = 0;
  const opener = { isConnected: true, focus() { restored++; } };
  const closeButton = {
    hidden: false, addEventListener: (name, cb) => closeEvents.set(name, cb),
    focus() { closeFocus++; }, getClientRects() { return [1]; }
  };
  const backdrop = { addEventListener: (name, cb) => backdropEvents.set(name, cb) };
  const modal = {
    hidden: true, classList: { add: name => modalClasses.add(name), remove: name => modalClasses.delete(name) },
    querySelector(selector) {
      if (selector === '[data-shortcuts-close]') return closeButton;
      if (selector === '[data-shortcuts-dismiss]') return backdrop;
      throw Error('Unexpected selector: ' + selector);
    },
    querySelectorAll() { return [closeButton]; },
    addEventListener: (name, cb) => modalEvents.set(name, cb)
  };
  const guide = { hidden: guideHidden };
  const trigger = {
    addEventListener: (name, cb) => triggerEvents.set(name, cb),
    setAttribute: (name, value) => attributes.set(name, value)
  };
  const document = {
    readyState: 'complete', activeElement: opener,
    body: { classList: { add: name => bodyClasses.add(name), remove: name => bodyClasses.delete(name) } },
    getElementById(id) {
      if (id === 'ng-shortcuts-trigger') return trigger;
      if (id === 'ng-shortcuts-modal') return modal;
      if (id === 'first-run-guide') return guide;
      return null;
    },
    addEventListener: (name, cb) => documentEvents.set(name, cb)
  };
  const root = { document, requestAnimationFrame: cb => cb(), addEventListener: (name, cb) => rootEvents.set(name, cb) };
  vm.runInNewContext(read('web/ui/shortcut-guide.js'), { window: root });
  return { modal, triggerEvents, modalEvents, closeEvents, backdropEvents, rootEvents,
    bodyClasses, modalClasses, attributes, document, opener, closeButton,
    get restored() { return restored; }, get closeFocus() { return closeFocus; } };
}

test('click opens with focus and aria-expanded; Done returns focus without navigation', () => {
  const env = environment();
  env.triggerEvents.get('click')();
  assert.equal(env.modal.hidden, false);
  assert.equal(env.attributes.get('aria-expanded'), 'true');
  assert.equal(env.bodyClasses.has('ng-shortcuts-open'), true);
  assert.equal(env.modalClasses.has('is-open'), true);
  assert.equal(env.closeFocus, 1);
  env.closeEvents.get('click')();
  assert.equal(env.modal.hidden, true);
  assert.equal(env.attributes.get('aria-expanded'), 'false');
  assert.equal(env.bodyClasses.has('ng-shortcuts-open'), false);
  assert.equal(env.restored, 1);
});

test('Escape and backdrop dismiss the guide and do not change gameplay shortcuts', () => {
  const env = environment();
  env.triggerEvents.get('click')();
  let prevented = false, stopped = false;
  env.modalEvents.get('keydown')({key:'Escape', preventDefault(){prevented=true;}, stopPropagation(){stopped=true;}});
  assert.equal(prevented, true);
  assert.equal(stopped, true);
  assert.equal(env.modal.hidden, true);
  env.triggerEvents.get('click')();
  env.backdropEvents.get('click')();
  assert.equal(env.modal.hidden, true);
  assert.equal(env.restored, 2);
});

test('Tab focus stays in the dialog, and the first-run guide takes precedence', () => {
  const env = environment();
  env.triggerEvents.get('click')();
  env.document.activeElement = env.closeButton;
  let tabs = 0;
  env.modalEvents.get('keydown')({key:'Tab', shiftKey:false, preventDefault(){tabs++;}});
  env.modalEvents.get('keydown')({key:'Tab', shiftKey:true, preventDefault(){tabs++;}});
  assert.equal(tabs, 2);
  env.rootEvents.get('pagehide')();
  assert.equal(env.modal.hidden, true);
  const blocked = environment(false);
  blocked.triggerEvents.get('click')();
  assert.equal(blocked.modal.hidden, true);
});

test('listed shortcuts match built-in player and current default key profile', () => {
  const html = read('web/index.html');
  const plus = read('web/controls/plus-fullscreen.js');
  const esc = read('web/controls/esc-exit.js');
  const tab = read('web/controls/tab-pause.js');
  const controls = read('web/controls/global-controls.js');
  const home = read('web/app.js');
  assert.match(plus, /event\.key === '\+'/);
  assert.match(plus, /toggleFullscreen\(true\)/);
  assert.match(esc, /DOUBLE_PRESS_MS = 2000/);
  assert.match(tab, /e\.key !== 'Tab'/);
  assert.match(home, /event\.key === '\/'/);
  for (const line of ['a: 65', 'b: 83', 'c: 68', 'd: 70', 'start: 49', 'coin: 51',
    'combo_ab: 81', 'combo_abc: 82', 'combo_cd: 69', 'start: 50', 'coin: 52'])
    assert(controls.includes(line), 'Outdated documented key: ' + line);
  assert.match(html, /Esc <span aria-hidden="true">×2<\/span>/);
  assert.match(html, /Num 8\/2\/4\/6/);
});

test('bilingual keys, accessible layout, reduced motion and no duplicate close X', () => {
  const html = read('web/index.html');
  const lang = read('web/languages.js');
  const css = read('web/style.css');
  assert.match(lang, /shortcuts:\s*\{/);
  assert.match(lang, /ar: 'اختصارات لوحة المفاتيح'/);
  assert.match(lang, /en: 'Keyboard Shortcuts'/);
  assert.match(css, /\.ng-shortcuts-trigger\s*\{/);
  assert.match(css, /border-radius:\s*50%/);
  assert.match(css, /\.ng-shortcuts-modal\[hidden\]\s*\{\s*display:\s*none/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(html, /aria-labelledby="ng-shortcuts-title"/);
  assert.match(html, /aria-describedby="ng-shortcuts-description"/);
  assert.doesNotMatch(html, /ng-shortcuts-close-x|ng-dialog-close/);
});
