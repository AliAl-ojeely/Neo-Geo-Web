'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const read = path => fs.readFileSync(require('node:path').resolve(__dirname, '..', path), 'utf8');

function gallery(reduced = false) {
  const removed = [], resources = [], commits = [], effects = [];
  const originals = new Map();
  const paint = { setProperty() {}, removeProperty() {} };
  const elements = () => ({
    dataset: {}, style: { ...paint }, handlers: {},
    classList: { add() {}, remove() {}, contains() { return false; } },
    before() {}, remove() { removed.push(this); },
    addEventListener(type, fn) { this.handlers[type] = fn; },
    getAttribute() { return '{}'; }, removeAttribute() {}, setAttribute() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 100 }; },
    querySelectorAll() { return []; },
    async decode() {},
    animate(frames, timing) {
      let resolve;
      const finished = new Promise(done => { resolve = done; });
      effects.push({ frames, timing, resolve });
      return { finished, cancel() {} };
    }
  });
  const hero = { ...elements(), prepend() {}, append() {}, querySelector() { return copy; } };
  const copy = { ...elements(), cloneNode() { return elements(); } };
  const original = { ...elements(), id: 'featured-image', naturalWidth: 200, currentSrc: 'blob:original' };
  const images = [original];
  originals.set('arcade-hero', hero);
  const state = { NG_STATIC: true, matchMedia: () => ({ matches: reduced }), document: {
    hidden: false, body: elements(), documentElement: { dir: 'ltr' },
    getElementById(id) { return id === 'featured-image' ? images.find(img => img.id === id) : originals.get(id); },
    createElement(type) { const el = elements(); if (type === 'img') images.push(el); return el; }
  }, NGPreviews: {
    attach(img, name, options) {
      assert.equal(options.eager, true);
      img.currentSrc = 'blob:' + name;
      img.naturalWidth = 200;
    },
    detach(img) { resources.push(img.currentSrc); }
  } };
  original.removeAttribute = name => { if (name === 'id') original.id = ''; };
  const make = state.document.createElement;
  state.document.createElement = type => {
    const el = make(type);
    el.removeAttribute = name => { if (name === 'id') el.id = ''; };
    return el;
  };
  vm.runInNewContext(read('web/ui/arcade-home.js'), state);
  function show(id) {
    state.NGArcade.present({ filename:id, screenshot:id }, img => commits.push([id,img.currentSrc]));
    return images.at(-1);
  }
  return { show, effects, removed, resources, commits };
}

test('rapid navigation rejects stale decoded art and retains the retiring URL until the fade ends', async () => {
  const g = gallery();
  const abandoned = g.show('old-request');
  const next = g.show('new-request');
  assert.deepEqual(g.commits, []);
  assert.deepEqual(g.resources, ['blob:old-request']);
  await abandoned.handlers.load();
  assert.deepEqual(g.commits, []);
  await next.handlers.load();
  assert.deepEqual(g.commits, [['new-request','blob:new-request']]);
  assert.deepEqual(g.resources, ['blob:old-request']);
  assert.equal(g.effects[2].timing.duration, 300);
  g.effects[2].resolve();
  await Promise.resolve();
  assert.deepEqual(g.resources, ['blob:old-request','blob:original']);
});

test('reduced motion commits decoded art immediately and releases the old image', async () => {
  const g = gallery(true);
  const next = g.show('new-request');
  await next.handlers.load();
  assert.equal(g.effects.length, 0);
  assert.deepEqual(g.resources, ['blob:original']);
});

test('player touch layout and responsive footer keep scoped controls and real destinations', () => {
  const player = read('web/player.html');
  const css = read('web/ui/arcade-touch-controls.css');
  const homepage = read('web/index.html');
  assert.match(player, /data-touch-menu/);
  assert.match(player, /data-touch-value="spacing"/);
  assert.match(css, /object-fit: contain/);
  assert.match(css, /safe-area-inset-left/);
  assert.match(css, /46cqw/);
  assert.match(css, /ng-touch-tools\) \.ejs_virtualGamepad_open/);
  assert.match(homepage, /<nav class="arcade-footer-links"/);
  assert.match(homepage, /https:\/\/github\.com\/AliAl-ojeely\/Neo-Geo-Web/);
  assert.match(read('web/ui/arcade-renaissance.css'), /max-width: 700px[^}]+arcade-footer[^}]+grid-template-columns/s);
});
