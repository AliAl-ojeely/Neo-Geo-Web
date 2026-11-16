'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

class Element {
  constructor(tag = 'div', className = '', id = '') {
    this.tagName = tag.toUpperCase(); this.children = []; this.parentElement = null;
    this.id = id; this.classNames = new Set(className.split(/\s+/).filter(Boolean)); this.attrs = {};
    this.styleValues = {};
    this.style = { setProperty: (name, value) => { this.styleValues[name] = value; } };
    this.classList = {
      add: value => this.classNames.add(value),
      remove: value => this.classNames.delete(value),
      contains: value => this.classNames.has(value),
      toggle: (value, force) => {
        const next = force === undefined ? !this.classNames.has(value) : force;
        if (next) this.classNames.add(value); else this.classNames.delete(value);
        return next;
      }
    };
  }
  get firstChild() { return this.children[0] || null; }
  set className(name) { this.classNames = new Set(String(name).split(/\s+/).filter(Boolean)); }
  get className() { return [...this.classNames].join(' '); }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  appendChild(child) { this.children.push(child); child.parentElement = this; return child; }
  insertBefore(child, before) {
    const index = this.children.indexOf(before);
    if (index === -1) return this.appendChild(child);
    this.children.splice(index, 0, child); child.parentElement = this; return child;
  }
  querySelector(selector) {
    const match = item => selector[0] === '#' ? item.id === selector.slice(1) : item.classNames.has(selector.slice(1));
    for (const child of this.children) {
      if (match(child)) return child;
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
  }
  querySelectorAll(selector) {
    const results = [];
    const match = item => selector[0] === '#' ? item.id === selector.slice(1) : item.classNames.has(selector.slice(1));
    const visit = element => { for (const child of element.children) { if (match(child)) results.push(child); visit(child); } };
    visit(this);
    return results;
  }
}

function harness({ home = true, loading = false, hidden = false, noMain = false } = {}) {
  const body = new Element('body', home ? 'home-page' : 'settings-page');
  const main = noMain ? null : body.appendChild(new Element('main', 'home-main'));
  if (main) main.appendChild(new Element('section', 'hero-editorial'));
  const docEvents = {}, winEvents = {};
  const document = {
    body, hidden, readyState: loading ? 'loading' : 'complete',
    createElement: tag => new Element(tag),
    querySelector: selector => body.querySelector(selector),
    getElementById: id => body.querySelector('#' + id),
    addEventListener: (type, fn) => { (docEvents[type] ||= []).push(fn); }
  };
  const window = {
    document,
    addEventListener: (type, fn) => { (winEvents[type] ||= []).push(fn); }
  };
  vm.runInNewContext(read('web/ui/matrix-ambient.js'), { window }, { filename: 'matrix-ambient.js' });
  function dispatch(group, type) { for (const fn of group[type] || []) fn(); }
  return { body, main, document, window, docEvents, winEvents, dispatch };
}

test('Matrix Ambient mounts only in the home library and needs a real main', () => {
  for (const settings of [{ home: false }, { home: true, noMain: true }]) {
    const fixture = harness(settings);
    assert.equal(fixture.body.querySelector('#ng-matrix-ambient'), null);
  }
});

test('mounts one inaccessible, pointer-free ambient layer behind existing content', () => {
  const h = harness();
  const ambient = h.body.querySelector('#ng-matrix-ambient');
  assert(ambient);
  assert.equal(ambient.attrs['aria-hidden'], 'true');
  assert.equal(h.main.firstChild, ambient);
  assert(h.body.classList.contains('ng-matrix-enabled'));
  assert.equal(h.main.children[1].className, 'hero-editorial');
  assert.equal(h.body.querySelectorAll('#ng-matrix-ambient').length, 1);
});

test('repeated mount and document ready events do not duplicate ambient columns', () => {
  const h = harness({ loading: true });
  assert.equal(h.body.querySelector('#ng-matrix-ambient'), null);
  h.dispatch(h.docEvents, 'DOMContentLoaded');
  h.window.NGLibraryMatrix.mount();
  h.dispatch(h.docEvents, 'DOMContentLoaded');
  assert.equal(h.body.querySelectorAll('#ng-matrix-ambient').length, 1);
  assert.equal(h.body.querySelectorAll('.ng-matrix-column').length, 10);
});

test('each column has two identical reels for seamless CSS-only travel', () => {
  const h = harness();
  const columns = h.body.querySelectorAll('.ng-matrix-column');
  assert.equal(columns.length, 10);
  for (const [index, column] of columns.entries()) {
    const stream = column.querySelector('.ng-matrix-stream');
    const reels = stream.querySelectorAll('.ng-matrix-reel');
    assert.equal(reels.length, 2);
    assert.equal(reels[0].children.length, 4);
    assert.equal(reels[1].children.length, 4);
    assert.equal(column.styleValues['--ng-matrix-position'], `${((index + 0.5) / 10 * 100).toFixed(2)}%`);
    const first = reels[0].children.map(x => x.styleValues['--ng-matrix-tilt']);
    const second = reels[1].children.map(x => x.styleValues['--ng-matrix-tilt']);
    assert.deepEqual(first, second);
  }
});

test('ambient has a separate, tilted source-logo watermark', () => {
  const h = harness();
  assert.equal(h.body.querySelectorAll('.ng-matrix-watermark').length, 1);
  const css = read('web/ui/matrix-ambient.css');
  assert.match(css, /neo-geo-mark\.png/g);
  assert.match(css, /rotate\(-19deg\)/);
});

test('document hidden and bfcache events pause/restart without a timer', () => {
  const h = harness({ hidden: true });
  const ambient = h.body.querySelector('#ng-matrix-ambient');
  assert(ambient.classList.contains('ng-matrix-paused'));
  h.document.hidden = false;
  h.dispatch(h.winEvents, 'pageshow');
  assert.equal(ambient.classList.contains('ng-matrix-paused'), false);
  h.dispatch(h.winEvents, 'pagehide');
  assert(ambient.classList.contains('ng-matrix-paused'));
  h.dispatch(h.winEvents, 'pageshow');
  assert.equal(ambient.classList.contains('ng-matrix-paused'), false);
});

test('existing Living Library motion-off selector pauses streams', () => {
  const css = read('web/ui/matrix-ambient.css');
  assert.match(css, /\.home-page\.ng-living-reduced \.ng-matrix-stream/);
  assert.match(css, /animation-play-state:\s*paused\s*!important/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /\.ng-matrix-ambient\.ng-matrix-paused/);
  assert.doesNotMatch(read('web/ui/matrix-ambient.js'), /localStorage|sessionStorage|setInterval|setTimeout|requestAnimationFrame/);
});

test('decorative images are sourced only from the existing local logo', () => {
  const css = read('web/ui/matrix-ambient.css');
  assert.equal((css.match(/url\('\.\.\/media\/neo-geo-mark\.png'\)/g) || []).length, 2);
  assert.match(css, /pointer-events:\s*none/);
  assert.match(css, /z-index:\s*0/);
  assert.match(css, /opacity:\s*\.060/);
  assert.doesNotMatch(css, /https?:\/\/|@import|backdrop-filter/);
});

test('responsive CSS reduces columns on small screens and hides print decoration', () => {
  const css = read('web/ui/matrix-ambient.css');
  assert.match(css, /max-width:\s*780px/);
  assert.match(css, /max-width:\s*480px/);
  assert.match(css, /@media print/);
  assert.match(css, /nth-child\(2n\)/);
  assert.match(css, /nth-child\(3n\)/);
});

test('source integration is index-only, versioned, and follows Living Library v1.5.0', () => {
  const home = read('web/index.html');
  assert.equal((home.match(/matrix-ambient\.css\?v=1\.5\.2/g) || []).length, 1);
  assert.equal((home.match(/matrix-ambient\.js\?v=1\.5\.1/g) || []).length, 1);
  assert(home.indexOf('living-library.css?v=1.5.0') < home.indexOf('matrix-ambient.css?v=1.5.2'));
  assert(home.indexOf('living-library.js?v=1.5.0') < home.indexOf('matrix-ambient.js?v=1.5.1'));
  assert.doesNotMatch(read('web/player.html'), /matrix-ambient/);
  assert.doesNotMatch(read('web/settings.html'), /matrix-ambient/);
});

test('no ROM, BIOS, player, input, or vendor modifications in Matrix Ambient JS', () => {
  const js = read('web/ui/matrix-ambient.js');
  assert.doesNotMatch(js, /\bfetch\s*\(|XMLHttpRequest|WebSocket|Gamepad|EJS_emulator|saveSettings|\.click\s*\(/);
  assert.doesNotMatch(js, /\.innerHTML\s*=/);
  assert.match(js, /doc\?\.body\?\.classList\?\.contains\('home-page'\)/);
});
