'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root,p), 'utf8');

test('NGDialog is one accessible modal surface, without duplicate X', () => {
  const s=read('web/ui/message-box.js');
  assert.match(s,/element\.className = 'ng-dialog-backdrop ng-modal-overlay'/);
  assert.match(s,/class="ng-dialog ng-modal-panel" role="dialog" aria-modal="true"/);
  assert.match(s,/class="ng-dialog-heading ng-modal-heading"/);
  assert.match(s,/class="ng-dialog-actions ng-modal-actions"/);
  assert.match(s,/class="ng-dialog-cancel" data-ng-modal-action="secondary"/);
  assert.match(s,/class="ng-dialog-confirm" data-ng-modal-action="primary"/);
  assert.doesNotMatch(s,/ng-dialog-close|message_box\.close/);
  assert.match(s,/opts\.onConfirm\?\.\(\)/);
  assert.match(s,/cancel\.onclick = \(\) => finish\(false\)/);
  assert.match(s,/e\.key === 'Escape'/);
  assert.match(s,/e\.target === ui/);
});

test('ROMs, BIOS and PREVIEWS pickers reuse NGDialog.action and synchronous confirmation', () => {
  const s=read('web/library/library-ui.js');
  assert.match(s,/panel\.querySelectorAll\('\[data-pick\]'\)/);
  assert.match(s,/const role = b\.dataset\.pick/);
  assert.match(s,/window\.NGDialog\.action\(\{/);
  assert.match(s,/onConfirm: doPick/);
  assert.match(s,/NGLocal\.select\(role, b\.dataset\.directory === 'true'\)/);
  assert.match(read('web/offline/offline-ui.js'),/root\.NGDialog\.action\(\{/);
  assert.match(read('web/offline/offline-ui.js'),/root\.NGDialog\.confirm/);
});

test('welcome onboarding shares the same modal primitives but retains richer content and dismiss action', () => {
  const h=read('web/index.html');
  assert.match(h,/class="first-run-overlay ng-modal-overlay"/);
  assert.match(h,/class="first-run-panel ng-modal-panel"/);
  assert.match(h,/class="first-run-header ng-modal-heading"/);
  assert.match(h,/class="first-run-actions ng-modal-actions"/);
  assert.match(h,/class="guide-primary" data-guide-setup data-ng-modal-action="primary"/);
  assert.match(h,/class="guide-secondary" data-guide-dismiss data-ng-modal-action="secondary"/);
  assert.doesNotMatch(h,/first-run-close|aria-label="Close setup guide"/);
  assert.match(h,/id="first-run-guide"/);
  assert.match(h,/class="first-run-sources"/);
  const behavior=read('web/ui/site-extras.js');
  assert.match(behavior,/querySelectorAll\('\[data-guide-dismiss\]'\)/);
  assert.match(behavior,/event\.key === 'Escape'/);
});

test('modal design tokens and two button variants are shared in one stylesheet', () => {
  const c=read('web/style.css');
  assert.match(c,/Unified Modal Design System:/);
  assert.match(c,/\.ng-modal-panel\s*\{/);
  assert.match(c,/\.ng-dialog-backdrop,\s*\.first-run-backdrop\s*\{/);
  assert.match(c,/\.ng-modal-actions \[data-ng-modal-action="primary"\]/);
  assert.match(c,/\.ng-modal-actions \[data-ng-modal-action="secondary"\]/);
  assert.match(c,/@media \(max-width: 480px\)/);
  assert.doesNotMatch(c,/\.ng-dialog-close|\.first-run-close/);
});
