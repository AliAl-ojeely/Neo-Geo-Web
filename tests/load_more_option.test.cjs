'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

function preferences(storage = new Map()) {
  const window = {};
  const context = {
    window,
    NGI18n: { getLanguage: () => 'en' },
    localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value)
    }
  };
  vm.runInNewContext(read('web/preferences.js'), context);
  return { api: window.NGPrefs, storage };
}

test('paging remains enabled by default, can be saved false, and restores true', () => {
  const { api, storage } = preferences();
  assert.equal(api.DEFAULTS.loadMoreGames, true);
  assert.equal(api.load().loadMoreGames, true);
  const saved = api.load();
  saved.loadMoreGames = false;
  assert.equal(api.save(saved), true);
  assert.equal(api.load().loadMoreGames, false);
  assert.equal(JSON.parse(storage.get(api.KEY)).loadMoreGames, false);
  assert.equal(api.save(api.DEFAULTS), true);
  assert.equal(api.load().loadMoreGames, true);
});

test('existing saved preferences survive migration; malformed paging value is ignored', () => {
  const storage = new Map([['ng-webemu-settings-v012', JSON.stringify({ volume: 43, scale: '4:3', loadMoreGames: 'no' })]]);
  const { api } = preferences(storage);
  assert.equal(api.load().volume, 43);
  assert.equal(api.load().scale, '4:3');
  assert.equal(api.load().loadMoreGames, true);
  const after = api.load();
  after.loadMoreGames = false;
  assert.equal(api.save(after), true);
  assert.equal(api.load().volume, 43);
});

function page(allowPaging) {
  const state = { games: Array.from({ length: 77 }, (_, n) => ({ title: 'Game ' + n, filename: `game${n}.zip`, size: n, category: n % 2 ? 'action' : 'fighting' })),
    visibleCount: 30, category: null, view: 'all', query: '' };
  const grid = {
    items: [],
    replaceChildren(fragment) { this.items = fragment.items || [fragment]; },
    appendChild(fragment) { this.items.push(...fragment.items); },
    querySelectorAll() { return [...this.items]; }
  };
  const elements = {
    'game-grid': grid,
    'collection-title': { firstChild: { textContent: '' } },
    'results': { textContent: '' },
    'filter-description': { textContent: '' },
    'sort': { value: 'name' },
    'ng-load-more': { hidden: false },
    'ng-game-progress': { dataset: {}, textContent: '' }
  };
  const motion = [];
  const window = { NGPrefs: { load: () => ({ loadMoreGames: allowPaging }) },
    NGLibraryMotion: { reveal: (cards, replace) => motion.push({ count: cards.length, replace }) } };
  const document = { createDocumentFragment: () => ({ items: [], appendChild(item) { this.items.push(item); } }) };
  const source = read('web/app.js');
  const start = source.indexOf('function render(appendOnly = false) {');
  const end = source.indexOf('// Prefer a featured game', start);
  assert(start >= 0 && end > start);
  const context = {
    state, window, document,
    $: name => elements[name],
    categoryNames: { fighting: 'Fighting', action: 'Action' },
    favorites: new Set(),
    NGI18n: { t: (_key, params) => params ? `${params.shown}/${params.total}` : _key },
    node: (_tag, klass, content) => ({ klass, content }),
    card: game => ({ game })
  };
  const render = vm.runInNewContext(source.slice(start, end) + '\nrender;', context);
  return { state, grid, elements, motion, render, window };
}

test('enabled mode displays first 30 games and preserves incremental loading', () => {
  const p = page(true);
  p.render();
  assert.equal(p.grid.items.length, 30);
  assert.equal(p.elements['ng-load-more'].hidden, false);
  assert.equal(p.elements['results'].textContent, 77);
  p.state.visibleCount += 30;
  p.render(true);
  assert.equal(p.grid.items.length, 60);
  assert.equal(p.motion.at(-1).count, 30);
  p.state.visibleCount += 30;
  p.render(true);
  assert.equal(p.grid.items.length, 77);
  assert.equal(p.elements['ng-load-more'].hidden, true);
});

test('disabled mode displays every game, hides Load More and retains entrance animations', () => {
  const p = page(false);
  p.render();
  assert.equal(p.grid.items.length, 77);
  assert.equal(p.elements['ng-load-more'].hidden, true);
  assert.equal(p.elements['ng-game-progress'].textContent, '77/77');
  assert.equal(p.motion.length, 1);
  assert.deepEqual({ count: p.motion[0].count, replace: p.motion[0].replace }, { count: 77, replace: true });
  p.state.category = 'fighting';
  p.render();
  assert.equal(p.grid.items.length, 39);
  assert.equal(p.motion.at(-1).count, 39);
  p.state.query = 'Game 2';
  p.render();
  assert.equal(p.grid.items.length, 6);
  assert.equal(p.elements['results'].textContent, 6);
});

test('setting is localized, uses More options, and does not edit animation runtime', () => {
  const settings = read('web/settings.js');
  const home = read('web/index.html');
  const prefs = read('web/preferences.js');
  const lang = read('web/languages.js');
  assert.match(settings, /misc:\s*\(\) =>\s*\[/);
  assert.match(settings, /toggle\('loadMoreGames',\s*NGI18n\.t\('settings\.library_load_more_enable'\)\)/);
  assert.match(prefs, /loadMoreGames:\s*true/);
  assert.match(home, /src="\/assets\/preferences\.js" defer/);
  assert(home.indexOf('src="/assets/preferences.js"') < home.indexOf('src="/assets/app.js"'));
  for (const key of ['library_load_more_title', 'library_load_more_description', 'library_load_more_enable'])
    assert.match(lang, new RegExp(key + ':\\s*\\{'));
  assert.match(read('web/app.js'), /NGLibraryMotion\?\.reveal/);
  assert.match(read('web/ui/library-motion.js'), /const types = \['rise', 'side', 'scale'\]/);
});
