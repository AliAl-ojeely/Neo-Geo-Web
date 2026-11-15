'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const css = read('web/style.css');
const html = read('web/settings.html');
const head = '/* v1.4.7: use the shared Neo Geo Custom badge geometry';
const index = css.indexOf(head);
const patch = index < 0 ? '' : css.slice(index);

// Assert against actual CSS geometry, not just an expected static START width.
test('all three Settings editors share the content-sized action badge rule', () => {
  assert(index >= 0, 'v1.4.7 stylesheet block is missing');
  assert.equal(css.indexOf(head, index + 1), -1, 'duplicated CSS patch');
  for (const selector of [
    '#global-controls-root .control-item .control-action > .control-symbol',
    '#ng-gamepad-remap-root .ng-gpr-row.control-item .ng-gpr-details.control-action > .control-symbol',
    '#ng-gamepad-visualizer-root .ng-kv-link.control-item .ng-kv-link-title.control-action > .control-symbol'
  ]) assert(patch.includes(selector), 'missing selector: ' + selector);
});

test('START, COIN and combinations have intrinsic width and stay on one line', () => {
  assert.match(patch, /inline-size:\s*max-content/);
  assert.match(patch, /min-inline-size:\s*36px/);
  assert.match(patch, /flex:\s*0 0 auto/);
  assert.match(patch, /white-space:\s*nowrap/);
  assert.match(patch, /word-break:\s*keep-all/);
  assert.match(patch, /unicode-bidi:\s*isolate/);
  assert.doesNotMatch(patch, /(?:^|\n)\s*(?:width|min-width|flex-basis):\s*(?:36|62|72)px\s*;/);
});

test('bilingual labels and bindings can wrap without overlapping the badges', () => {
  assert.match(patch, /flex-wrap:\s*wrap/);
  assert.match(patch, /overflow-wrap:\s*break-word/);
  assert.match(patch, /word-break:\s*normal/);
  assert.match(patch, /max-inline-size:\s*100%/);
  assert.match(patch, /@media\s*\(max-width:\s*540px\)/);
});

test('all added CSS is limited to Settings and does not target the vendor or player', () => {
  const selectors = [...patch.matchAll(/([^{}]+)\{/g)]
    .map(m => m[1].replace(/\/\*[\s\S]*?\*\//g, '').trim())
    .filter(s => s && !s.startsWith('@'));
  for (const selector of selectors) {
    for (const part of selector.split(',')) {
      const stripped = part.trim();
      if (stripped) assert(stripped.startsWith('.settings-page '), 'unscoped CSS: ' + stripped);
    }
  }
  assert.doesNotMatch(patch, /\b!important\b/);
});

test('Settings references v1.4.7 CSS and keeps the working v1.4.5 input script', () => {
  assert.match(html, /\/assets\/style\.css\?v=1\.4\.7/);
  assert.doesNotMatch(html, /\/assets\/style\.css\?v=1\.4\.6/);
  assert.match(html, /\/assets\/controls\/gamepad-remap\.js\?v=1\.4\.5/);
});

test('production controls and persistence JS are not modified for a CSS-only repair', () => {
  const remap = read('web/controls/gamepad-remap.js');
  assert.match(remap, /ng-gamepad-gameplay-mapping-v1/);
  assert.match(remap, /root\.localStorage\.setItem/);
  assert.match(remap, /function tickSettings\(/);
  assert.match(remap, /root\.NGGamepadRemap\s*=/);
  assert.match(read('web/controls/controls-ui.js'), /function render\(\)/);
});
