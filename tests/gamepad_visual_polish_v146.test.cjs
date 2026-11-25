'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'web/style.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'web/settings.html'), 'utf8');
const remap = fs.readFileSync(path.join(root, 'web/controls/gamepad-remap.js'), 'utf8');
const visualizer = fs.readFileSync(path.join(root, 'web/ui/gamepad-keyboard-visualizer.js'), 'utf8');
const tail = css.slice(css.indexOf('/* v1.4.6: fit long Neo Geo Custom symbols'),
  css.indexOf('/* v1.4.7: use the shared Neo Geo Custom badge geometry'));

test('v1.4.6 CSS is limited to the existing Settings gamepad components', () => {
  assert.match(tail, /^\/\* v1\.4\.6:/);
  for (const selector of tail.matchAll(/\.settings-page\s+#([^\s,{]+)[^,{]*/g)) {
    assert.match(selector[1], /^ng-gamepad-(remap|visualizer)-root$/);
  }
  assert.doesNotMatch(tail, /\/\*.*?\*\/\s*(?:body|:root|\.player-page)/s);
});

test('START and COIN have physically wider, centered badges', () => {
  for (const action of ['start', 'coin']) {
    assert.match(tail, new RegExp('\\.ng-gpr-row\\[data-action="' + action + '"\\]\\s+\\.control-symbol'));
    assert.match(tail, new RegExp('\\.ng-kv-link\\[data-action="' + action + '"\\]\\s+\\.control-symbol'));
  }
  assert.match(tail, /width:\s*62px/);
  assert.match(tail, /min-width:\s*62px/);
  assert.match(tail, /flex:\s*0 0 62px/);
  assert.match(tail, /white-space:\s*nowrap/);
  assert.match(tail, /text-align:\s*center/);
});

test('combo glyphs are wide and the layout wraps on narrow screens', () => {
  assert.match(tail, /ng-kv-link\[data-action\^="combo_"\]/);
  assert.match(tail, /width:\s*72px/);
  assert.match(tail, /@media\s*\(max-width:\s*620px\)/);
  assert.match(tail, /flex-wrap:\s*wrap/);
  assert.match(tail, /overflow-wrap:\s*anywhere/);
});

test('existing action data attributes support style targeting without JS changes', () => {
  assert.match(remap, /row\.setAttribute\('data-action', action\)/);
  assert.match(visualizer, /card\.dataset\.action = id/);
});

test('Settings explicitly requests the new stylesheet revision', () => {
  assert.match(html, /\/assets\/style\.css\?v=1\.8\.0/);
  assert.doesNotMatch(html, /\/assets\/style\.css\?v=1\.4\.4/);
  assert.match(html, /gamepad-remap\.js\?v=1\.4\.5/);
});
