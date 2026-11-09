'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('web/languages.js', 'utf8');

// A new VM models a fresh page/process while the provided Map models persistent browser storage.
function browser(store = new Map(), extra = {}) {
  const documentElement = { setAttribute() {}, removeAttribute() {} };
  const context = {
    console,
    location: { hostname: 'example.test' },
    document: {
      documentElement,
      readyState: 'loading',
      addEventListener() {},
      querySelectorAll: () => []
    },
    localStorage: {
      getItem: key => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, value)
    },
    ...extra
  };
  vm.runInNewContext(source, context);
  return context;
}
const first = browser();
assert.equal(first.NGI18n.getLanguage(), 'en');
assert.equal(first.document.documentElement.lang, 'en');
assert.equal(first.document.documentElement.dir, 'ltr');
const stored = new Map([
  ['favorites', '["breakers.zip"]'],
  ['ng-webemu-settings-v012', '{"volume":43,"scale":"4:3"}']
]);
const before = new Map(stored);
const selected = browser(stored);
assert.equal(selected.NGI18n.setLanguage('ar'), true);
assert.equal(selected.document.documentElement.dir, 'rtl');
assert.equal(selected.document.documentElement.lang, 'ar');
assert.equal(stored.get('neogeo-ui-language-v1'), 'ar');
for (const [key, value] of before) assert.equal(stored.get(key), value);
assert.equal(browser(stored).NGI18n.getLanguage(), 'ar');
assert.equal(browser(new Map(stored)).NGI18n.getLanguage(), 'ar');
assert.equal(browser(new Map([['neogeo-ui-language-v1', 'bad']])).NGI18n.getLanguage(), 'en');
assert.equal(
  browser(new Map([['ng-webemu-settings-v012', '{broken']])).NGI18n.getLanguage(),
  'en'
);
const legacy = new Map([['ng-webemu-settings-v012', '{"language":"ar-AR","volume":31}']]);
assert.equal(browser(legacy).NGI18n.getLanguage(), 'ar');
assert.equal(legacy.get('ng-webemu-settings-v012'), '{"language":"ar-AR","volume":31}');
assert.equal(legacy.get('neogeo-ui-language-v1'), 'ar');
const unavailable = browser(new Map(), {
  localStorage: {
    getItem() {
      throw Error('denied');
    },
    setItem() {
      throw Error('denied');
    }
  }
});
assert.equal(unavailable.NGI18n.getLanguage(), 'en');
assert.equal(unavailable.NGI18n.setLanguage('ar'), false);
assert.equal(unavailable.NGI18n.getLanguage(), 'ar');
assert.equal(first.NGI18n.t('common.playNamed', { title: 'Breakers' }), 'Play Breakers');
assert.equal(first.NGI18n.t('common.playNamed', { title: {} }), 'Play {title}');
assert.equal(first.NGI18n.t('absent.key'), '[absent.key]');
assert.equal(first.NGI18n.getMissingKeys().length, 1);
for (const [namespace, values] of Object.entries(first.NGI18n.catalog)) {
  for (const [name, pair] of Object.entries(values)) {
    assert.equal(typeof pair.en, 'string', namespace + '.' + name);
    assert.equal(typeof pair.ar, 'string');
    assert(pair.en.trim() && pair.ar.trim());
    const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
    assert.deepEqual(placeholders(pair.en), placeholders(pair.ar));
  }
}
// Parse the catalog to detect duplicate object keys that ordinary JSON/JS evaluation would overwrite.
const acornModule = { exports: {} };
new Function(
  'exports',
  'module',
  process.binding('natives')['internal/deps/acorn/acorn/dist/acorn']
)(acornModule.exports, acornModule);
const tree = acornModule.exports.parse(source, { ecmaVersion: 'latest' });
function duplicates(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'ObjectExpression') {
    const names = node.properties
      .filter(p => p.type === 'Property' && !p.computed)
      .map(p => p.key.name ?? p.key.value);
    assert.equal(new Set(names).size, names.length, 'duplicate catalog/object key');
  }
  for (const value of Object.values(node))
    if (value && typeof value === 'object')
      Array.isArray(value) ? value.forEach(duplicates) : duplicates(value);
}
duplicates(tree);
console.log(
  'PASS localization: first visit, migration, persistence, directions, storage failures, preservation, placeholders, fallback, bilingual parity and duplicate keys'
);

// Minimal text nodes exercise in-place translation without recreating controls or touching protected data.
function textDocument(values) {
  const nodes = values.map(value => ({ nodeType: 3, nodeValue: value, parentElement: { closest: () => null } }));
  const document = { nodeType: 9, documentElement: { setAttribute() {}, removeAttribute() {} }, readyState: 'loading', addEventListener() {}, querySelectorAll: () => [], createTreeWalker() { let i = 0; return { nextNode: () => nodes[i++] || null }; } };
  return { document, nodes };
}
const dom = textDocument(['Display Language', '  Updates immediately and is\n remembered on this browser.  ']);
const live = browser(new Map(), { document: dom.document });
live.NGI18n.setLanguage('ar');
assert.equal(dom.nodes[0].nodeValue, live.NGI18n.t('common.displayLanguage'));
assert.equal(dom.nodes[1].nodeValue.trim(), live.NGI18n.t('common.languageHint'));
dom.nodes[0].nodeValue = live.NGI18n.t('common.playNamed', { title: 'breakers.zip' });
live.NGI18n.applyTranslations();
live.NGI18n.setLanguage('en');
assert.equal(dom.nodes[0].nodeValue, 'Play breakers.zip');
live.NGI18n.setLanguage('ar');
assert.equal(dom.nodes[0].nodeValue, 'تشغيل breakers.zip');
const protectedValue = dom.nodes[1].nodeValue;
dom.nodes[1].parentElement.closest = () => ({});
live.NGI18n.setLanguage('en');
assert.equal(dom.nodes[1].nodeValue, protectedValue);

// Every statically referenced translation key must resolve; catalog declarations cannot hide gaps.
function checkKeys(node, file) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' && node.callee.object.name === 'NGI18n' && node.callee.property.name === 't') {
    const arg = node.arguments[0];
    const candidates = arg?.type === 'Literal' ? [arg] : arg?.type === 'ConditionalExpression' ? [arg.consequent, arg.alternate] : [];
    for (const value of candidates) if (value.type === 'Literal' && typeof value.value === 'string') {
      const [namespace, key] = value.value.split('.');
      assert(first.NGI18n.catalog[namespace]?.[key], file + ': ' + value.value);
    }
  }
  for (const value of Object.values(node)) if (value && typeof value === 'object') Array.isArray(value) ? value.forEach(v => checkKeys(v, file)) : checkKeys(value, file);
}
for (const file of fs.readdirSync('web', { recursive: true }).filter(name => name.endsWith('.js'))) {
  if (file === 'languages.js') continue;
  checkKeys(acornModule.exports.parse(fs.readFileSync(require('node:path').join('web', file), 'utf8'), { ecmaVersion: 'latest' }), file);
}
// Explicit HTML translation keys override ambiguous phrase matching without replacing nested elements.
function markedElement(attributes = {}) {
  const values = new Map(Object.entries(attributes));
  return {
    nodeType: 1,
    childNodes: [],
    closest: () => null,
    getAttribute: name => values.get(name) ?? null,
    setAttribute: (name, value) => values.set(name, String(value))
  };
}
function markedText(value, parent) {
  const text = { nodeType: 3, nodeValue: value, parentElement: parent };
  parent.childNodes.push(text);
  return text;
}
const heading = markedElement({ 'data-i18n-text': 'index.arcade' });
const headingText = markedText('Previously replaced text ', heading);
const emphasis = markedElement({ 'data-i18n-text': 'index.without_limits' });
const emphasisText = markedText('without limits.', emphasis);
heading.childNodes.push(emphasis);
const search = markedElement({
  placeholder: 'Earlier placeholder',
  'aria-label': 'Old search label',
  'data-i18n-attrs': JSON.stringify({
    placeholder: 'index.search_games_series_or_rom_filenames',
    'aria-label': 'index.search_library'
  })
});
const composed = markedElement({
  'data-i18n-text':
    'index.neo_geo_system_files_required_by_fbneo|index.from_the_bios_folder_keep_this_inner'
});
const composedStart = markedText('Neo Geo system files required by FBNeo. Select ', composed);
const filename = markedElement();
markedText('neogeo.zip', filename);
composed.childNodes.push(filename);
const composedEnd = markedText(' from the BIOS folder. Keep this inner ZIP compressed.', composed);
const orderedNodes = [heading, headingText, emphasis, emphasisText, search, composed, composedStart, filename, filename.childNodes[0], composedEnd];
const explicitDocument = {
  nodeType: 9,
  documentElement: { setAttribute() {}, removeAttribute() {} },
  readyState: 'loading',
  addEventListener() {},
  querySelectorAll: () => [],
  createTreeWalker() {
    let index = 0;
    return { nextNode: () => orderedNodes[index++] || null };
  }
};
const explicit = browser(new Map(), { document: explicitDocument });
explicit.NGI18n.setLanguage('ar');
assert.equal(headingText.nodeValue.trim(), explicit.NGI18n.t('index.arcade'));
assert.equal(emphasisText.nodeValue.trim(), explicit.NGI18n.t('index.without_limits'));
assert.equal(heading.childNodes[1], emphasis, 'nested markup must not be replaced');
assert.equal(search.getAttribute('placeholder'), explicit.NGI18n.t('index.search_games_series_or_rom_filenames'));
assert.equal(search.getAttribute('aria-label'), explicit.NGI18n.t('index.search_library'));
assert.equal(composedStart.nodeValue.trim(), explicit.NGI18n.t('index.neo_geo_system_files_required_by_fbneo'));
assert.equal(composedEnd.nodeValue.trim(), explicit.NGI18n.t('index.from_the_bios_folder_keep_this_inner'));
assert.equal(filename.childNodes[0].nodeValue, 'neogeo.zip', 'technical names stay unchanged');
explicit.NGI18n.setLanguage('en');
assert.equal(headingText.nodeValue.trim(), 'Arcade,');
assert.equal(emphasisText.nodeValue.trim(), 'without limits.');
assert.equal(search.getAttribute('aria-label'), 'Search library');
explicit.NGI18n.setLanguage('ar');
assert.equal(heading.childNodes[1], emphasis, 'language toggles preserve existing controls and markup');
console.log('PASS explicit static HTML text/attribute localization and nested DOM preservation');

// Validate every statically declared HTML translation key, including multi-part guide paragraphs.
for (const page of ['index.html', 'player.html', 'settings.html']) {
  const html = fs.readFileSync(require('node:path').join('web', page), 'utf8');
  const declared = [];
  for (const match of html.matchAll(/\bdata-i18n-text="([^"]+)"/g)) {
    declared.push(...match[1].split('|'));
  }
  for (const match of html.matchAll(/\bdata-i18n-attrs="([^"]+)"/g)) {
    const mapping = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
    declared.push(...Object.values(mapping));
  }
  for (const key of declared) {
    const [namespace, name] = key.split('.');
    assert(first.NGI18n.catalog[namespace]?.[name], page + ': missing translation ' + key);
  }
  assert(declared.length > 0, page + ' must declare static translations');
}
console.log('PASS static HTML translation declarations across all three pages');

console.log('PASS static/multiline/dynamic DOM translation, protected values and translation-key references');

// Emulator menu defaults follow UI language until an explicit existing menu preference is present.
const preferenceStore = new Map();
const preferenceContext = browser(preferenceStore);
preferenceContext.window = preferenceContext;
vm.runInNewContext(fs.readFileSync('web/preferences.js', 'utf8'), preferenceContext);
preferenceContext.NGI18n.setLanguage('ar');
assert.equal(preferenceContext.NGPrefs.load().language, 'ar-AR');
preferenceStore.set('ng-webemu-settings-v012', JSON.stringify({ language: 'en-US', volume: 42, scanlines: true }));
const originalPreferences = preferenceStore.get('ng-webemu-settings-v012');
assert.equal(preferenceContext.NGPrefs.load().language, 'en-US');
assert.equal(preferenceContext.NGPrefs.load().volume, 42);
preferenceContext.NGI18n.setLanguage('en');
assert.equal(preferenceStore.get('ng-webemu-settings-v012'), originalPreferences);
vm.runInNewContext(fs.readFileSync('web/state-guard.js', 'utf8'), preferenceContext);
assert.throws(() => preferenceContext.NGStateGuard.inspect(new Uint8Array(2)), /State size/);
preferenceContext.NGI18n.setLanguage('ar');
assert.throws(() => preferenceContext.NGStateGuard.inspect(new Uint8Array(2)), /حجم/);
console.log('PASS existing emulator preferences preserved and save-state rejection localized');
