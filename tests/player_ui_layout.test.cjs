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

// The unified modal uses footer actions, not a redundant top-right X button.
const guideHtml = fs.readFileSync('web/index.html', 'utf8');
const dialogSource = fs.readFileSync('web/ui/message-box.js', 'utf8');
assert.match(css, /\.ng-modal-panel\s*\{/);
assert.match(css, /\.ng-modal-heading\s*\{/);
assert.match(css, /\.ng-modal-actions\s*\{/);
assert.doesNotMatch(css, /\.first-run-close\b|\.ng-dialog-close\b/);
assert.match(guideHtml, /class="first-run-panel ng-modal-panel"/);
assert.match(guideHtml, /data-guide-dismiss/);
assert.doesNotMatch(guideHtml, /class="first-run-close"/);
assert.match(dialogSource, /class="ng-dialog ng-modal-panel"/);
assert.match(dialogSource, /class="ng-dialog-cancel" data-ng-modal-action="secondary"/);
assert.doesNotMatch(dialogSource, /ng-dialog-close/);

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
console.log('PASS: player Start CSS, unified no-X modal contract, and notice translation');
