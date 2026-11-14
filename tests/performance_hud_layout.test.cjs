'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const POSITIONS = ['top-left', 'top-center', 'top-right', 'middle-left', 'middle-right',
  'bottom-left', 'bottom-center', 'bottom-right'];

function element(tag = 'div') {
  return {
    tagName: tag.toUpperCase(), id: '', children: [], attrs: {}, textContent: '', listeners: {},
    append(...nodes) { for (const n of nodes) { this.children.push(n); n.parentElement = this; } },
    setAttribute(key, val) { this.attrs[key] = String(val); },
    getAttribute(key) { return this.attrs[key]; },
    addEventListener(key, fn) { this.listeners[key] = fn; },
    remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(n => n !== this); },
    click() { this.listeners.click?.(); }
  };
}
function monitor() {
  const host = element(), bar = element(), events = {}, frames = new Map();
  let time = 0, nextId = 0, coreFrames = 0;
  const doc = {
    visibilityState: 'visible',
    createElement: element,
    createElementNS(_namespace, tag) { return element(tag); },
    addEventListener(name, fn) { events[name] = fn; },
    querySelector(selector) { return selector === '.diagnostics-actions-bar' ? bar : null; }
  };
  const window = {
    document: doc, performance: { now: () => time, memory: { usedJSHeapSize: 40 * 1024 * 1024 } },
    NGI18n: { t: key => 'localized:' + key },
    requestAnimationFrame(fn) { const id = ++nextId; frames.set(id, fn); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    addEventListener(name, fn) { events['window:' + name] = fn; },
    URL: { createObjectURL() { return 'blob:fake'; }, revokeObjectURL() {} },
    setTimeout(fn) { fn(); }
  };
  const emulator = { started: true, paused: false, gameManager: { getFrameNum: () => coreFrames }, elements: { parent: host } };
  vm.runInNewContext(read('web/ui/performance-monitor.js'), { window, Blob, console });
  const step = (t, coreAdvance = 1) => {
    time = t; coreFrames += coreAdvance;
    assert.equal(frames.size, 1, 'exactly one active animation frame callback');
    const [id, callback] = [...frames][0]; frames.delete(id); callback(t);
  };
  return { host, bar, doc, events, window, emulator, frames, step };
}
function preferences(stored = null) {
  let raw = stored;
  const window = {
    localStorage: {
      getItem() { return raw; },
      setItem(_key, value) { raw = value; }
    }
  };
  vm.runInNewContext(read('web/preferences.js'), { window, localStorage: window.localStorage, NGI18n: { getLanguage: () => 'en' } });
  return { api: window.NGPrefs, stored: () => raw };
}

test('the existing monitor remains opt-in and defaults to full/top-right', () => {
  const h = monitor();
  assert.equal(h.window.NGPerformanceMonitor.start(h.emulator, { enabled: false }), false);
  assert.equal(h.host.children.length, 0);
  assert.equal(h.frames.size, 0);
  assert(h.window.NGPerformanceMonitor.start(h.emulator, { enabled: true }));
  const hud = h.host.children[0];
  assert.equal(hud.attrs['data-ng-size'], 'full');
  assert.equal(hud.attrs['data-ng-position'], 'top-right');
  assert.equal(hud.children[1].children.length, 6);
  assert.equal(h.bar.children.length, 1);
});

test('all eight physical positions are accepted and all stay inside fullscreen parent', () => {
  const h = monitor();
  for (const position of POSITIONS) {
    assert(h.window.NGPerformanceMonitor.start(h.emulator, { enabled: true, position }));
    assert.equal(h.host.children.length, 1);
    assert.equal(h.host.children[0].attrs['data-ng-position'], position);
    assert.equal(h.frames.size, 1);
  }
  assert.equal(h.window.NGPerformanceMonitor.report().display.position, 'bottom-right');
});

test('Full, Medium, Small each retain the six source cells but specify a visible preset', () => {
  const h = monitor();
  for (const size of ['full', 'medium', 'small']) {
    h.window.NGPerformanceMonitor.start(h.emulator, { enabled: true, size });
    const hud = h.host.children[0];
    assert.equal(hud.attrs['data-ng-size'], size);
    assert.deepEqual(hud.children[1].children.map(c => c.attrs['data-ng-metric']),
      ['fps', 'frame', 'memory', 'session', 'gameFps', 'emulationSpeed']);
    assert.equal(h.window.NGPerformanceMonitor.report().display.size, size);
  }
});

test('untrusted layout choices fall back to full/top-right and do not become CSS identifiers', () => {
  const h = monitor();
  h.window.NGPerformanceMonitor.start(h.emulator, { enabled: true, size: '<evil>', position: 'left: 0' });
  assert.equal(h.host.children[0].attrs['data-ng-size'], 'full');
  assert.equal(h.host.children[0].attrs['data-ng-position'], 'top-right');
});

test('the Small preset keeps real core FPS and active session in JSON, never substitutes browser FPS', () => {
  const h = monitor();
  h.window.NGPerformanceMonitor.start(h.emulator, { enabled: true, size: 'small' });
  let n = 0;
  for (let t = 17; t <= 3100; t += 17) h.step(t, (++n % 2 ? 0 : 1));
  const r = h.window.NGPerformanceMonitor.report();
  assert(r.samples.length >= 2);
  assert(r.samples.some(x => x.gameFps > 25 && x.gameFps < 32));
  assert(r.samples.some(x => x.fps > 50));
  assert(r.activeSeconds > 2);
  assert.equal(r.display.size, 'small');
  assert.equal(h.host.children[0].children[2].children[1].children[0].attrs.points, '');
});

test('Medium suppresses graph painting while preserving data export', () => {
  const h = monitor();
  h.window.NGPerformanceMonitor.start(h.emulator, { enabled: true, size: 'medium' });
  for (let t = 17; t <= 3100; t += 17) h.step(t);
  assert(h.window.NGPerformanceMonitor.report().samples.some(x => x.gameFps !== null));
  assert.equal(h.host.children[0].children[2].children[1].children[0].attrs.points, '');
  assert.equal(h.bar.children.length, 1);
});

test('pause, locale updates, pagehide and re-entry keep the new layout lifecycle safe', () => {
  const h = monitor();
  h.window.NGPerformanceMonitor.start(h.emulator, { enabled: true, size: 'small', position: 'bottom-center' });
  h.events['ng-language-changed']();
  assert.equal(h.frames.size, 1);
  assert.equal(h.host.children[0].attrs['data-ng-position'], 'bottom-center');
  h.emulator.paused = true;
  for (let t = 17; t <= 2000; t += 17) h.step(t, 0);
  assert.equal(h.window.NGPerformanceMonitor.report().activeSeconds, 0);
  h.events['window:pagehide']();
  assert.equal(h.frames.size, 0);
  assert.equal(h.host.children.length, 0);
  assert.equal(h.bar.children.length, 0);
});

test('preferences persist valid size/position, reject invalid values and preserve old fields', () => {
  const storage = preferences();
  let p = storage.api.load();
  assert.equal(p.performanceHudSize, 'full');
  assert.equal(p.performanceHudPosition, 'top-right');
  assert.equal(p.performanceMonitor, false);
  assert.equal(p.loadMoreGames, true);
  p.performanceMonitor = true;
  p.performanceHudSize = 'small';
  p.performanceHudPosition = 'middle-left';
  assert.equal(storage.api.save(p), true);
  assert.equal(storage.api.load().performanceHudSize, 'small');
  assert.equal(storage.api.load().performanceHudPosition, 'middle-left');
  assert.equal(storage.api.load().loadMoreGames, true);
  p = storage.api.load();
  p.performanceHudSize = 'no'; p.performanceHudPosition = 'center';
  storage.api.save(p);
  assert.equal(storage.api.load().performanceHudSize, 'full');
  assert.equal(storage.api.load().performanceHudPosition, 'top-right');
});

test('the settings card saves choices through existing data-pref and has bilingual labels', () => {
  const settings = read('web/settings.js');
  const prefs = read('web/preferences.js');
  const locale = read('web/languages.js');
  assert.match(settings, /hudSelect\('performanceHudSize'/);
  assert.match(settings, /hudSelect\('performanceHudPosition'/);
  assert.match(settings, /data-pref="\$\{key\}"/);
  assert.match(settings, /e\.target\.value/);
  assert.match(prefs, /performanceHudSize:\s*'full'/);
  assert.match(prefs, /performanceHudPosition:\s*'top-right'/);
  for (const key of ['hud_size_label','hud_position_label','hud_small','hud_full','hud_medium',
      'hud_top_left','hud_top_center','hud_top_right','hud_middle_left','hud_middle_right',
      'hud_bottom_left','hud_bottom_center','hud_bottom_right']) {
    assert.match(locale, new RegExp(key + ':\\s*\\{\\s*en: .*?ar:'));
  }
});

test('CSS hides the right indicators in Small and Medium and defines every physical placement', () => {
  const css = read('web/style.css');
  const small = css.slice(css.indexOf("[data-ng-size='small'] .ng-performance-cell:not"));
  assert.match(small, /data-ng-metric='gameFps'/);
  assert.match(small, /data-ng-metric='session'/);
  assert.match(css, /data-ng-size='medium'\] .ng-performance-cell\[data-ng-metric='frame'/);
  assert.match(css, /data-ng-size='medium'\] .ng-performance-cell\[data-ng-metric='memory'/);
  assert.match(css, /data-ng-size='small'\] .ng-performance-chart/);
  for (const p of POSITIONS) assert(css.includes("[data-ng-position='" + p + "']"), p);
  assert.match(css, /pointer-events: none/);
  assert.match(css, /@media \(max-width: 650px\)/);
});

test('integration keeps vendor Fullscreen, library, runtime reports and shortcuts unchanged', () => {
  const player = read('web/player.html');
  const logic = read('web/player.js');
  const settings = read('web/settings.html');
  const js = read('web/ui/performance-monitor.js');
  assert.match(player, /performance-monitor\.js\?v=1\.3\.2/);
  assert.match(logic, /size: prefs\.performanceHudSize/);
  assert.match(logic, /position: prefs\.performanceHudPosition/);
  assert.match(settings, /settings\.js\?v=1\.3\.2/);
  assert.match(js, /host\.append\(hud\)/);
  assert.match(js, /manager\?\.getFrameNum\?\.\(\)/);
  assert.doesNotMatch(js, /requestFullscreen\s*=|postMainLoop\s*=|getFrameNum\s*=/);
  assert.doesNotMatch(read('web/index.html'), /performance-monitor\.js/);
});
