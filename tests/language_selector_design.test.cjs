'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'web/settings.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'web/style.css'), 'utf8');
const settingsJS = fs.readFileSync(path.join(root, 'web/settings.js'), 'utf8');
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');

// Keep the original select and event handler so saved user languages remain intact.
test('language selector preserves its existing integration contract', () => {
  assert.equal((html.match(/id="ui-language"/g) || []).length, 1);
  assert.match(html, /data-ui-language/);
  assert.match(html, /data-i18n-text="common\.displayLanguage"/);
  assert.match(html, /data-i18n-text="common\.languageHint"/);
  assert.match(html, /<option value="en" lang="en" dir="ltr">English<\/option>/);
  assert.match(html, /<option value="ar" lang="ar" dir="rtl">العربية<\/option>/);
  assert.match(settingsJS, /NGI18n\.setLanguage\(languageSelect\.value\)/);
  assert.match(settingsJS, /languageSelect\.addEventListener\('change'/);
});

// Make the native control visibly distinct in both directions without custom JS.
test('dark dropdown is accessible, responsive, and RTL aware', () => {
  assert.match(html, /class="ui-language-select-shell"/);
  assert.match(html, /class="ui-language-chevron" aria-hidden="true"/);
  assert.match(html, /id="ui-language-status" class="ui-language-status" role="status" aria-live="polite"/);
  assert.match(css, /:is\(\.ui-language-setting, \.setting-control-body\) \.ui-language-select\s*\{/);
  assert.match(css, /appearance: none/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /\.ui-language-chevron\s*\{[^}]*inset-inline-end:/s);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

// The documentation must be publishable Markdown, not a nested fenced block.
test('README includes setup, safety boundaries, and an accurate AI disclosure', () => {
  assert.match(readme, /^# Neo-Geo Web Port\s*$/m);
  assert.match(readme, /^## AI-Assisted Analysis & Development$/m);
  assert.match(readme, /^### .*ROM, PREVIEWS, and BIOS linking$/m);
  assert.match(readme, /^## Project Architecture$/m);
  assert.match(readme, /^### English & Arabic$/m);
  assert.match(readme, /Partial validation/);
  assert.match(readme, /THIRD_PARTY_NOTICES\.md/);
  assert.match(readme, /not a replacement for the emulator core or independent validation/i);
});

// Both language selectors use the same native control styling without sharing settings state.
test('EmulatorJS menu language matches display-language styling while preserving its setting', () => {
  assert.match(settingsJS, /const isEmulatorLanguage = key === 'language'/);
  assert.match(settingsJS, /isEmulatorLanguage \? ' class="ui-language-select"' : ''/);
  assert.match(settingsJS, /class="ui-language-select-shell"/);
  assert.match(settingsJS, /class="ui-language-chevron" aria-hidden="true"/);
  assert.match(settingsJS, /option\('language', \[/);
  assert.match(settingsJS, /\['ar-AR', NGI18n\.t\('settings\.arabic_ar_ar'\)\]/);
  assert.match(settingsJS, /\['en-US', 'English \(en-US\)'\]/);
  assert.match(settingsJS, /data-pref="\$\{key\}"/);
  assert.match(settingsJS, /\$\('save-settings'\)\.addEventListener\('click'/);
  assert.match(css, /:is\(\.ui-language-setting, \.setting-control-body\) \.ui-language-select:focus-visible/);
});
