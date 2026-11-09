'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Keep only the DOM contracts used by dialogs, including a stable shared backdrop and action buttons.
function dialogContext() {
  const elements = new Map();
  const element = () => ({ hidden: false, textContent: '', onclick: null, focus() {} });
  for (const selector of [
    '#ng-dialog-title',
    '#ng-dialog-desc',
    '.ng-dialog-confirm',
    '.ng-dialog-cancel',
    '.ng-dialog-close'
  ])
    elements.set(selector, element());
  const backdrop = { ...element(), querySelector: selector => elements.get(selector) };
  const document = {
    activeElement: null,
    createElement: () => backdrop,
    body: { append() {}, classList: { add() {}, remove() {} } }
  };
  const ctx = { document, console };
  vm.runInNewContext(fs.readFileSync('web/languages.js', 'utf8'), ctx);
  vm.runInNewContext(fs.readFileSync('web/ui/message-box.js', 'utf8'), ctx);
  return { ctx, backdrop, elements };
}
(async () => {
  const { ctx, backdrop, elements } = dialogContext();
  let synchronous = false;
  const result = ctx.NGDialog.action({
    message: 'test',
    onConfirm() {
      synchronous = true;
      throw Error('picker failure');
    }
  });
  elements.get('.ng-dialog-confirm').onclick();
  assert.equal(synchronous, true, 'picker activation remains synchronous');
  assert.equal(await result, false);
  assert.equal(backdrop.hidden, false, 'replacement error dialog remains visible');
  assert.equal(elements.get('#ng-dialog-desc').textContent, 'picker failure');
  assert.equal(typeof elements.get('.ng-dialog-confirm').onclick, 'function');
  elements.get('.ng-dialog-confirm').onclick();
  assert.equal(backdrop.hidden, true);
  const asyncResult = ctx.NGDialog.action({
    message: 'test',
    onConfirm: () => Promise.reject(Error('async picker failure'))
  });
  elements.get('.ng-dialog-confirm').onclick();
  assert.equal(await asyncResult, true);
  await Promise.resolve();
  assert.equal(backdrop.hidden, false);
  assert.equal(elements.get('#ng-dialog-desc').textContent, 'async picker failure');

  let valid = true;
  const companion = {
    URL,
    location: { hostname: '127.0.0.1' },
    NG_BASE: new URL('http://127.0.0.1:8778/Neo-Geo-Web/'),
    fetch: async () => ({
      ok: true,
      json: async () =>
        valid
          ? { service: 'neogeo-local-companion', schema: 1, roles: {} }
          : { service: 'other', schema: 99 }
    })
  };
  vm.runInNewContext(fs.readFileSync('web/languages.js', 'utf8'), companion);
  vm.runInNewContext(fs.readFileSync('web/library/local-companion.js', 'utf8'), companion);
  await companion.NGCompanion.connect();
  assert.equal(companion.NGCompanion.available, true);
  valid = false;
  assert.equal(await companion.NGCompanion.refresh(), null);
  assert.equal(companion.NGCompanion.available, false);
  assert.equal(companion.NGCompanion.status, null);
  assert.equal(Object.keys(companion.NGCompanion.handles).length, 0);
  // A network failure after a successful connection must also clear stale status metadata.
  valid = true;
  await companion.NGCompanion.refresh();
  assert.equal(companion.NGCompanion.available, true);
  companion.fetch = async () => { throw Error('connection lost'); };
  assert.equal(await companion.NGCompanion.refresh(), null);
  assert.equal(companion.NGCompanion.available, false);
  assert.equal(companion.NGCompanion.status, null);
  assert.equal(companion.NGCompanion.error, 'connection lost');
  console.log(
    'PASS stabilization: synchronous activation, visible synchronous/asynchronous errors, companion stale status reset'
  );
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
