'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const rootPath = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(rootPath, p), 'utf8');

function dom(tag = 'div') {
  return {
    tagName: tag, children: [], attrs: {}, textContent: '', events: {},
    append(...nodes) { for (const node of nodes) { this.children.push(node); node.parentElement = this; } },
    setAttribute(name, value) { this.attrs[name] = String(value); },
    addEventListener(name, listener) { this.events[name] = listener; },
    remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(x => x !== this); },
    click() { this.events.click?.(); }
  };
}
function fixture({ getter = true } = {}) {
  const events = {}, frames = new Map(), host = dom(), bar = dom();
  let clock = 0, frameId = 0, coreCounter = 0, reads = 0, throwRead = false;
  const doc = {
    visibilityState: 'visible',
    createElement: dom, createElementNS(_namespace, tag) { return dom(tag); },
    addEventListener(name, cb) { events[name] = cb; },
    querySelector(sel) { return sel === '.diagnostics-actions-bar' ? bar : null; }
  };
  const window = {
    document: doc, performance: { now: () => clock },
    NGI18n: { t: key => key },
    requestAnimationFrame(cb) { const id = ++frameId; frames.set(id, cb); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    addEventListener(name, cb) { events['window:' + name] = cb; },
    URL: { createObjectURL: () => 'blob:fake', revokeObjectURL() {} },
    setTimeout(cb) { cb(); }
  };
  const manager = getter ? {
    getFrameNum() {
      reads++;
      if (throwRead) throw Error('Core unavailable');
      return coreCounter;
    }
  } : {};
  const emulator = { started: true, paused: false, gameManager: manager, elements: { parent: host } };
  vm.runInNewContext(read('web/ui/performance-monitor.js'), { window, console, Blob });
  function step(time, advance = 0) {
    clock = time;
    coreCounter += advance;
    const [[id, fn]] = frames.entries();
    assert.equal(frames.size, 1);
    frames.delete(id);
    fn(time);
  }
  return { window, doc, host, bar, emulator, events, frames, step,
    get coreCounter() { return coreCounter; }, set coreCounter(v) { coreCounter = v; },
    get reads() { return reads; }, set throwRead(v) { throwRead = v; }
  };
}

test('disabled monitor does not touch the core or construct a HUD', () => {
  const h = fixture();
  assert.equal(h.window.NGPerformanceMonitor.start(h.emulator, { enabled: false }), false);
  assert.equal(h.reads, 0);
  assert.equal(h.host.children.length, 0);
});

test('game frame rate comes from the emulation core counter, not browser frame callbacks', () => {
  const h = fixture();
  h.window.NGPerformanceMonitor.start(h.emulator, { enabled: true });
  let i = 0;
  // 60 browser RAF events per second but only one core frame every two events.
  for (let t = 17; t <= 3060; t += 17) h.step(t, (++i % 2 === 0) ? 1 : 0);
  const report = h.window.NGPerformanceMonitor.report();
  const sample = report.samples.find(x => x.gameFps !== null);
  assert(sample, 'measured game FPS must become available after two core reads');
  assert(sample.fps > 50);
  assert(sample.gameFps > 25 && sample.gameFps < 33);
  assert(sample.emulationSpeedPercent > 40 && sample.emulationSpeedPercent < 60);
  assert.notEqual(sample.gameFps, sample.fps);
  assert.equal(report.nominalNeoGeoHz, 59.18);
  assert.equal(report.schema, 'neogeo-performance-v2');
  assert.equal(h.host.children[0].children[1].children.length, 6);
  assert.match(h.host.children[0].children[1].children[5].children[1].textContent, /%$/);
  assert.equal('rom' in report, false);
});

test('sampling the core roughly once per second avoids per-frame overhead', () => {
  const h = fixture();
  h.window.NGPerformanceMonitor.start(h.emulator, { enabled: true });
  for (let t = 16; t < 4200; t += 16) h.step(t, 1);
  assert(h.reads <= 5, 'the core getter must not be called on each RAF');
  assert(h.window.NGPerformanceMonitor.report().samples.length <= 4);
});

test('missing core API and throwing getters remain unavailable, never browser FPS substitutions', () => {
  for (const missing of [true, false]) {
    const h = fixture({ getter: !missing });
    if (!missing) h.throwRead = true;
    h.window.NGPerformanceMonitor.start(h.emulator, { enabled: true });
    for (let t = 17; t <= 2100; t += 17) h.step(t, 1);
    const samples = h.window.NGPerformanceMonitor.report().samples;
    assert(samples.length > 0);
    assert(samples.every(x => x.gameFps === null && x.emulationSpeedPercent === null));
    assert(h.host.children[0].children[1].children[4].children[1].textContent.includes('unavailable'));
  }
});

test('pause and background reset the baseline rather than measuring missed time', () => {
  const h = fixture();
  h.window.NGPerformanceMonitor.start(h.emulator, { enabled: true });
  for (let t = 17; t <= 2100; t += 17) h.step(t, 1);
  assert(h.window.NGPerformanceMonitor.report().samples.some(s => s.gameFps !== null));
  h.emulator.paused = true;
  for (let t = 2117; t <= 4150; t += 17) h.step(t, 0);
  assert.equal(h.window.NGPerformanceMonitor.report().samples.at(-1).gameFps, null);
  h.emulator.paused = false;
  for (let t = 4167; t <= 5200; t += 17) h.step(t, 1);
  assert.equal(h.window.NGPerformanceMonitor.report().samples.at(-1).gameFps, null);
  h.doc.visibilityState = 'hidden'; h.events.visibilitychange();
  for (let t = 5217; t <= 6250; t += 17) h.step(t, 0);
  assert.equal(h.window.NGPerformanceMonitor.report().samples.at(-1).gameFps, null);
});

test('rewind or counter reset produces unavailable, not a negative FPS', () => {
  const h = fixture();
  h.window.NGPerformanceMonitor.start(h.emulator, { enabled: true });
  for (let t = 17; t <= 2100; t += 17) h.step(t, 1);
  h.coreCounter = 0;
  for (let t = 2117; t <= 3100; t += 17) h.step(t, 0);
  const last = h.window.NGPerformanceMonitor.report().samples.at(-1);
  assert.equal(last.gameFps, null);
  assert.equal(last.emulationSpeedPercent, null);
});

test('HUD remains in the exact vendor fullscreen parent; lifecycle and locale cleanup are preserved', () => {
  const h = fixture();
  h.window.NGPerformanceMonitor.start(h.emulator, { enabled: true });
  assert.equal(h.host.children[0].id, 'ng-performance-hud');
  assert.equal(h.frames.size, 1);
  h.events['ng-language-changed']();
  assert.equal(h.frames.size, 1);
  h.window.NGPerformanceMonitor.stop();
  assert.equal(h.frames.size, 0);
  assert.equal(h.host.children.length, 0);
  assert.equal(h.bar.children.length, 0);
});

test('new core metrics do not mutate the vendor core, browser FPS, settings or game controls', () => {
  const js = read('web/ui/performance-monitor.js');
  const html = read('web/player.html');
  const locale = read('web/languages.js');
  assert.match(js, /manager\?\.getFrameNum\?\.\(\)/);
  assert.match(js, /delta \/ elapsed/);
  assert.doesNotMatch(js, /postMainLoop\s*=|requestFullscreen\s*=|getFrameNum\s*=/);
  assert.match(html, /performance-monitor\.js\?v=1\.3\.2/);
  assert.match(locale, /emulationSpeed: \{/);
  assert.match(locale, /gameFps: \{/);
  assert.match(js, /requestAnimationFrame\(tick\)/);
  assert.match(js, /host\.append\(hud\)/);
});
