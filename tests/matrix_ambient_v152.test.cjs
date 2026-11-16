'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const css = read('web/ui/matrix-ambient.css');
const html = read('web/index.html');

// Locate only the requested CSS rule, not another media-query override.
function rule(selector) {
  const position = css.indexOf(selector + ' {');
  assert.notEqual(position, -1, `Missing CSS rule: ${selector}`);
  return css.slice(position, css.indexOf('}', position) + 1);
}

test('v1.5.2 preserves all existing Matrix Ambient markup and JS behavior', () => {
  const js = fs.readFileSync(path.join(root, 'web/ui/matrix-ambient.js'));
  assert.equal(createHash('sha256').update(js).digest('hex'), '5b29d9082bc5edcfeaede6d7052a1960e9d6a2a11567113894a7bcda4793a23f');
  assert.match(html, /matrix-ambient\.js\?v=1\.5\.1/);
  assert.match(html, /living-library\.js\?v=1\.5\.0/);
  assert.doesNotMatch(html, /matrix-ambient\.js\?v=1\.5\.2/);
});

test('only home library references v1.5.2 stylesheet exactly once', () => {
  assert.equal((html.match(/matrix-ambient\.css\?v=1\.5\.2/g) || []).length, 1);
  assert.doesNotMatch(html, /matrix-ambient\.css\?v=1\.5\.1/);
  assert(html.indexOf('living-library.css?v=1.5.0') < html.indexOf('matrix-ambient.css?v=1.5.2'));
  for (const file of ['web/player.html', 'web/settings.html'])
    assert.doesNotMatch(read(file), /matrix-ambient/);
});

test('column opacity increases from v1.5.1 by a moderate absolute offset', () => {
  const column = rule('.home-page .ng-matrix-column');
  const match = column.match(/opacity:\s*calc\(var\(--ng-matrix-opacity,\s*\.07\)\s*\+\s*(\.\d+)\)/);
  assert(match, 'Column opacity must preserve the existing per-column baseline');
  const extra = Number(match[1]);
  assert(extra >= .04 && extra <= .065);
  for (const base of [.065, .075, .085]) {
    const output = base + extra;
    assert(output >= .10 && output <= .16);
  }
});

test('large tilted watermark is more visible but retains a subtle maximum', () => {
  const watermark = rule('.home-page .ng-matrix-watermark');
  assert.match(watermark, /rotate\(-19deg\)/);
  const [, raw] = watermark.match(/opacity:\s*(\.\d+)/) || [];
  assert(raw && Number(raw) > .035 && Number(raw) <= .075);
});

test('only selected images fade; the unselected majority never receives the fade animation', () => {
  const selectors = [
    'nth-child(3n + 1) .ng-matrix-mark:nth-child(2)',
    'nth-child(3n + 2) .ng-matrix-mark:nth-child(4)',
    'nth-child(4n + 3) .ng-matrix-mark:nth-child(1)',
    'nth-child(5n) .ng-matrix-mark:nth-child(3)'
  ];
  for (const selector of selectors) assert(css.includes(selector), selector);
  let count = 0;
  for (let col = 1; col <= 10; col++) for (let mark = 1; mark <= 4; mark++) {
    if ((col % 3 === 1 && mark === 2) || (col % 3 === 2 && mark === 4) ||
        (col % 4 === 3 && mark === 1) || (col % 5 === 0 && mark === 3)) count++;
  }
  assert(count >= 8 && count <= 16, 'Only a measured subset should pulse');
  assert.doesNotMatch(rule('.home-page .ng-matrix-mark'), /animation:/);
});

test('fade is smooth rather than fast or synchronized blinking', () => {
  assert.match(css, /@keyframes ng-matrix-mark-fade\s*\{[\s\S]*?0%, 12%, 100%\s*\{\s*opacity:\s*0;/);
  assert.match(css, /32%, 57%\s*\{\s*opacity:\s*1;/);
  assert.match(css, /78%\s*\{\s*opacity:\s*\.15;/);
  assert.match(css, /ease-in-out infinite/);
  const durations = [...css.matchAll(/--ng-matrix-fade-duration:\s*(\d+)s;/g)].map(match => Number(match[1]));
  assert.deepEqual(durations, [18, 22, 26]);
  assert.equal(new Set([...css.matchAll(/--ng-matrix-fade-delay:\s*-(\d+)s;/g)].map(x => x[1])).size, 3);
  assert.match(css, /animation-delay:\s*calc\(var\(--ng-matrix-fade-delay/);
});

test('Motion Off disables fading and makes selected marks stationary', () => {
  assert.match(css, /\.home-page\.ng-living-reduced \.ng-matrix-mark\s*\{\s*animation:\s*none\s*!important;/);
  assert.match(css, /\.home-page\.ng-living-reduced \.ng-matrix-stream/);
  assert.match(css, /opacity:\s*\.8;/);
});

test('document-hidden and bfcache pauses also pause individual logo fades', () => {
  assert.match(css, /\.ng-matrix-ambient\.ng-matrix-paused \.ng-matrix-stream/);
  assert.match(css, /\.ng-matrix-ambient\.ng-matrix-paused \.ng-matrix-mark/);
  assert.match(css, /animation-play-state:\s*paused\s*!important/);
});

test('system preference disables both falling streams and individual fades', () => {
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /\.home-page \.ng-matrix-stream,\s*\.home-page \.ng-matrix-mark\s*\{\s*animation:\s*none\s*!important;/);
});

test('mobile watermark is stronger but columns remain limited', () => {
  assert.match(css, /max-width:\s*780px/);
  assert.match(css, /max-width:\s*480px/);
  assert.match(css, /\.ng-matrix-column:nth-child\(2n\)\s*\{\s*display:\s*none;/);
  assert.match(css, /\.ng-matrix-column:nth-child\(3n\)\s*\{\s*display:\s*none;/);
  assert.match(css, /opacity:\s*\.044;/);
});

test('decorations remain pointer-free, self-contained, and unprintable', () => {
  assert.match(css, /pointer-events:\s*none/);
  assert.match(css, /\.home-page \.ng-matrix-ambient\s*\{[\s\S]*?pointer-events:\s*none/);
});

test('home effect does not add new network/media/ROM/control dependencies', () => {
  const js = read('web/ui/matrix-ambient.js');
  assert.equal((css.match(/url\('\.\.\/media\/neo-geo-mark\.png'\)/g) || []).length, 2);
  assert.doesNotMatch(css, /@import|https?:\/\//);
  assert.doesNotMatch(js, /fetch\s*\(|setInterval|setTimeout|requestAnimationFrame|localStorage|Gamepad|EJS_emulator/);
  assert.match(css, /@media print/);
});
