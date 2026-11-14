'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const srcRoot = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(srcRoot, rel), 'utf8');

function element(tag = 'div') {
  const e = {
    tagName: tag.toUpperCase(), children: [], attrs: {}, listeners: {}, textContent: '',
    append(...nodes) { for (const n of nodes) { this.children.push(n); n.parentElement = this; } },
    setAttribute(key, value) { this.attrs[key] = String(value); },
    getAttribute(key) { return this.attrs[key]; },
    addEventListener(type, fn) { this.listeners[type] = fn; },
    remove() {
      if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(n => n !== this);
    },
    click() { this.listeners.click?.(); }
  };
  return e;
}
function environment({ memory = true } = {}) {
  const events = {}, frames = new Map(), host = element('div'), bar = element('div');
  let time = 0, next = 1, download = null;
  const doc = {
    visibilityState: 'visible',
    createElement: element,
    createElementNS: (_, tag) => element(tag),
    addEventListener(type, cb) { events[type] = cb; },
    querySelector(q) { return q === '.diagnostics-actions-bar' ? bar : null; }
  };
  const root = {
    document: doc,
    performance: { now: () => time, ...(memory ? { memory: { usedJSHeapSize: 104857600 } } : {}) },
    NGI18n: { t: key => 'translated:' + key },
    requestAnimationFrame: fn => { const id = next++; frames.set(id, fn); return id; },
    cancelAnimationFrame: id => frames.delete(id),
    addEventListener: (key, fn) => { events['window:' + key] = fn; },
    URL: { createObjectURL: () => 'blob:monitor', revokeObjectURL() {} },
    setTimeout(fn) { fn(); }
  };
  root.window = root;
  root.Blob = Blob;
  vm.runInNewContext(read('web/ui/performance-monitor.js'), { window: root, Blob, console });
  function step(t) {
    time = t;
    const current = [...frames.entries()];
    assert.equal(current.length, 1, 'one RAF callback per frame');
    frames.delete(current[0][0]);
    current[0][1](t);
  }
  return { root, host, bar, doc, events, step, frames, emulator: { started: true, paused: false, elements: { parent: host } } };
}

test('disabled by default; no DOM or animation work', () => {
  const h = environment();
  assert.equal(h.root.NGPerformanceMonitor.start(h.emulator, { enabled: false }), false);
  assert.equal(h.host.children.length, 0);
  assert.equal(h.frames.size, 0);
  assert.equal(h.root.NGPerformanceMonitor.report(), null);
});

test('HUD is mounted to exact EmulatorJS fullscreen element, not document body', () => {
  const h = environment();
  assert.equal(h.root.NGPerformanceMonitor.start(h.emulator, { enabled: true }), true);
  assert.equal(h.host.children.length, 1);
  assert.equal(h.host.children[0].id, 'ng-performance-hud');
  assert.equal(h.host.children[0].attrs['aria-label'], 'translated:performance_monitor.title');
  assert.equal(h.bar.children.length, 1);
  assert.equal(h.frames.size, 1);
});

test('browser frame samples are bounded at 30 and elapsed session advances', () => {
  const h = environment();
  h.root.NGPerformanceMonitor.start(h.emulator, { enabled: true });
  for (let t = 17; t < 37000; t += 17) h.step(t);
  const report = h.root.NGPerformanceMonitor.report();
  assert.equal(report.samples.length, 30);
  assert(report.activeSeconds > 34);
  assert(report.samples.some(s => s.fps > 40 && s.fps < 70));
  assert.equal(report.metrics.fps, 'requestAnimationFrame callback cadence; not FBNeo core FPS');
  assert(report.samples.every(s => s.heapMB === 100));
  assert.equal(Object.keys(report).includes('rom'), false);
});

test('paused and background states do not accumulate active session time', () => {
  const h = environment();
  h.root.NGPerformanceMonitor.start(h.emulator, { enabled: true });
  for (let t = 16; t < 1100; t += 16) h.step(t);
  const before = h.root.NGPerformanceMonitor.report().activeSeconds;
  h.emulator.paused = true;
  for (let t = 1104; t < 5000; t += 16) h.step(t);
  assert.equal(h.root.NGPerformanceMonitor.report().activeSeconds, before);
  h.doc.visibilityState = 'hidden'; h.events.visibilitychange();
  h.emulator.paused = false;
  for (let t = 5008; t < 7200; t += 16) h.step(t);
  assert.equal(h.root.NGPerformanceMonitor.report().activeSeconds, before);
  h.doc.visibilityState = 'visible'; h.events.visibilitychange();
  for (let t = 7200; t < 8600; t += 16) h.step(t);
  assert(h.root.NGPerformanceMonitor.report().activeSeconds > before);
});

test('unsupported memory displays N/A and reports null, not a fabricated number', () => {
  const h = environment({ memory: false });
  h.root.NGPerformanceMonitor.start(h.emulator, { enabled: true });
  for (let t = 17; t < 1100; t += 17) h.step(t);
  assert.equal(h.root.NGPerformanceMonitor.report().samples[0].heapMB, null);
  assert(h.host.children[0].children[1].children[2].children[1].textContent.includes('unavailable'));
});

test('language changes refresh label without restarting or adding another RAF', () => {
  const h = environment();
  h.root.NGPerformanceMonitor.start(h.emulator, { enabled: true });
  h.events['ng-language-changed']();
  assert.equal(h.host.children.length, 1);
  assert.equal(h.frames.size, 1);
});

test('exit/pagehide cancels RAF and removes controls; repeated start is idempotent', () => {
  const h = environment();
  h.root.NGPerformanceMonitor.start(h.emulator, { enabled: true });
  h.root.NGPerformanceMonitor.start(h.emulator, { enabled: true });
  assert.equal(h.host.children.length, 1);
  assert.equal(h.frames.size, 1);
  h.events['window:pagehide']();
  assert.equal(h.frames.size, 0);
  assert.equal(h.host.children.length, 0);
  assert.equal(h.bar.children.length, 0);
});

test('integration is player-only and settings/controls keep their contracts', () => {
  const player = read('web/player.html');
  const logic = read('web/player.js');
  const prefs = read('web/preferences.js');
  const settings = read('web/settings.js');
  const home = read('web/index.html');
  const css = read('web/style.css');
  assert.match(player, /ui\/performance-monitor\.js/);
  assert.doesNotMatch(home, /ui\/performance-monitor\.js/);
  assert.match(logic, /NGPerformanceMonitor\?\.start/);
  assert.match(logic, /NGPerformanceMonitor\?\.stop/);
  assert.match(prefs, /performanceMonitor:\s*false/);
  assert.match(prefs, /'performanceMonitor'/);
  assert.match(settings, /toggle\('performanceMonitor'/);
  assert.match(css, /#game \.ng-performance-hud/);
  assert.match(css, /pointer-events: none/);
  assert.match(css, /#game:fullscreen/);
  assert.match(read('web/controls/esc-exit.js'), /DOUBLE_PRESS_MS = 2000/);
});
