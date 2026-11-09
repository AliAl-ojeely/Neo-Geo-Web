'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

// Only the first-party shared dialog and welcome guide should own modal controls.
test('shared MessageBox has actions but no duplicate X button or handler', () => {
  const src = read('web/ui/message-box.js');
  assert.doesNotMatch(src, /ng-dialog-close|message_box\.close/);
  assert.match(src, /class="ng-dialog-confirm"/);
  assert.match(src, /class="ng-dialog-cancel"/);
  assert.match(src, /cancel\.onclick = \(\) => finish\(false\)/);
  assert.match(src, /e\.key === 'Escape'/);
  assert.match(src, /e\.target === ui/);
});

test('welcome modal keeps footer dismissal but no top-right X', () => {
  const html = read('web/index.html');
  const css = read('web/style.css');
  assert.doesNotMatch(html, /first-run-close|aria-label="Close setup guide"/);
  assert.doesNotMatch(css, /first-run-close|ng-dialog-close/);
  assert.match(html, /class="guide-secondary" data-guide-dismiss/);
  assert.match(html, /data-guide-setup/);
  assert.match(read('web/ui/site-extras.js'), /querySelectorAll\('\[data-guide-dismiss\]'\)/);
  assert.match(read('web/ui/site-extras.js'), /event\.key === 'Escape'/);
});

function fakeEnvironment() {
  let focusCount = 0;
  const buttons = {
    '.ng-dialog-confirm': { hidden: false, disabled: false, focus() { focusCount++; }, isConnected: true },
    '.ng-dialog-cancel': { hidden: false, disabled: false, focus() { focusCount++; }, isConnected: true },
    '.ng-dialog-close': null
  };
  const elements = {
    '#ng-dialog-title': { textContent: '' },
    '#ng-dialog-desc': { textContent: '' },
    ...buttons
  };
  const dialog = {
    hidden: true,
    innerHTML: '',
    querySelector(selector) {
      if (selector === '.ng-dialog-close') throw Error('Stale X reference');
      if (!Object.prototype.hasOwnProperty.call(elements, selector)) throw Error('Unknown selector '+selector);
      return elements[selector];
    },
    querySelectorAll() { return [buttons['.ng-dialog-cancel'], buttons['.ng-dialog-confirm']].filter(x => !x.hidden && !x.disabled); }
  };
  const classNames = new Set();
  const document = {
    activeElement: { isConnected:true, focus() { focusCount++; } },
    createElement: () => dialog,
    body: { append() {}, classList: { add: c=>classNames.add(c), remove: c=>classNames.delete(c) } }
  };
  const ctx = { document, NGI18n: { t: key => key }, console };
  vm.runInNewContext(read('web/ui/message-box.js'), ctx);
  return { dialog, elements, ctx, classNames, focused:()=>focusCount };
}

test('shared dialog confirm and cancel retain their behavior and accessibility', async () => {
  const d=fakeEnvironment();
  const yes=d.ctx.NGDialog.confirm('Delete only these files?');
  assert.doesNotMatch(d.dialog.innerHTML, /ng-dialog-close|class="[^"]*close[^"]*"/);
  assert.match(d.dialog.innerHTML, /aria-modal="true"/);
  assert.match(d.dialog.innerHTML, /aria-labelledby="ng-dialog-title"/);
  assert.match(d.dialog.innerHTML, /aria-describedby="ng-dialog-desc"/);
  assert.equal(d.elements['#ng-dialog-desc'].textContent, 'Delete only these files?');
  d.elements['.ng-dialog-confirm'].onclick();
  assert.equal(await yes, true);
  assert.equal(d.dialog.hidden, true);
  assert.equal(d.classNames.has('ng-dialog-active'), false);
  const no=d.ctx.NGDialog.confirm('Cancel this operation?');
  d.elements['.ng-dialog-cancel'].onclick();
  assert.equal(await no, false);
  assert.equal(d.dialog.hidden, true);
});

test('alert, Escape and backdrop stay usable without an X button', async () => {
  const d=fakeEnvironment();
  const notice=d.ctx.NGDialog.alert('Complete');
  assert.equal(d.elements['.ng-dialog-cancel'].hidden,true);
  d.elements['.ng-dialog-confirm'].onclick();
  assert.equal(await notice,true);
  const escape=d.ctx.NGDialog.confirm('Continue?');
  let prevented=false;
  d.dialog.onkeydown({key:'Escape',preventDefault(){prevented=true;}});
  assert.equal(prevented,true);
  assert.equal(await escape,false);
  const backdrop=d.ctx.NGDialog.confirm('Continue?');
  d.dialog.onclick({target:d.dialog});
  assert.equal(await backdrop,false);
});
