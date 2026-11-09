'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Guard the positioning contract that keeps the vendor Start button inside the theater.
const css = fs.readFileSync('web/style.css', 'utf8');
const stageRule = css.match(/\.emulator-stage\s+#game\s*\{([^}]+)\}/);
assert(stageRule, 'player stage selector is present');
assert.match(stageRule[1], /display:\s*block\s*;/);
assert.doesNotMatch(stageRule[1], /display:\s*flex\s*;/);
const startRule = css.match(/\.emulator-stage\s+#game\.ejs_parent\s+\.ejs_start_button\s*\{([^}]+)\}/);
assert(startRule, 'the EmulatorJS Start button has a scoped visible position');
assert.match(startRule[1], /position:\s*absolute\s*;/);
assert.match(startRule[1], /top:\s*50%\s*;/);
assert.match(startRule[1], /left:\s*50%\s*;/);
assert.match(startRule[1], /bottom:\s*auto\s*;/);
assert.match(startRule[1], /z-index:\s*30\s*;/);

// The close control follows the inline end of the active document direction.
const closeRule = css.match(/\.first-run-close\s*\{([^}]+)\}/);
assert(closeRule);
assert.match(closeRule[1], /inset-inline-end:\s*20px\s*;/);
assert.match(closeRule[1], /inset-inline-start:\s*auto\s*;/);
assert.doesNotMatch(closeRule[1], /\bleft:\s*20px\s*;/);

// Verify the display-language event only updates a visible notice, never the emulator.
const player = fs.readFileSync('web/player.js', 'utf8');
assert.match(player, /addEventListener\('ng-language-changed'/);
assert.match(player, /NGI18n\.translateText\(msg\.textContent\)/);
const langSource = fs.readFileSync('web/languages.js', 'utf8');
const ctx = {
  console,
  location: {hostname: 'example.test'},
  document: {documentElement: {}, readyState: 'loading', addEventListener() {}, querySelectorAll: () => []},
  localStorage: {getItem: () => null, setItem() {}}
};
vm.runInNewContext(langSource, ctx);
const key = 'player.emulator_ready_select_start_to_launch_the';
const en = ctx.NGI18n.t(key);
ctx.NGI18n.setLanguage('ar');
const ar = ctx.NGI18n.t(key);
assert.notEqual(en, ar);
ctx.NGI18n.setLanguage('en');
assert.equal(ctx.NGI18n.translateText(ar), en);
console.log('PASS: player Start CSS, bilingual guide close position, and notice translation');
