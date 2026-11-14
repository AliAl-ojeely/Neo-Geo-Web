'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const src = fs.readFileSync('web/settings.js', 'utf8');
const prefs = fs.readFileSync('web/preferences.js', 'utf8');
const app = fs.readFileSync('web/app.js', 'utf8');
const motion = fs.readFileSync('web/ui/library-motion.js', 'utf8');

// Only the visual ordering of the More options card changes.
test('Load More Games is the final More options card after runtime diagnostics', () => {
  const misc = src.slice(src.indexOf('    misc: () => ['), src.indexOf('  };', src.indexOf('    misc: () => [')));
  assert.equal((misc.match(/settings\.library_load_more_title/g) || []).length, 1);
  assert(misc.indexOf('settings.runtime_diagnostics') < misc.indexOf('settings.library_load_more_title'));
  assert.match(misc, /settings\.library_load_more_enable'\)\),\s*true\s*\)\s*\]\s*$/);
});

test('Move does not change the setting name, persistence or translations', () => {
  assert.match(src, /toggle\('loadMoreGames', NGI18n\.t\('settings\.library_load_more_enable'\)\)/);
  assert.match(prefs, /loadMoreGames: true/);
  assert.match(prefs, /'loadMoreGames'/);
  const locales = fs.readFileSync('web/languages.js', 'utf8');
  for (const key of ['library_load_more_title', 'library_load_more_description', 'library_load_more_enable']) {
    assert.match(locales, new RegExp(key + ':'));
  }
});

test('Both paging modes still run their existing animations', () => {
  assert.match(app, /window\.NGPrefs\?\.load\(\)\?\.loadMoreGames !== false/);
  assert.match(app, /NGLibraryMotion\?\.reveal/);
  assert.match(motion, /const types = \['rise', 'side', 'scale'\]/);
});

// The HTML entry uses a new asset version so existing caches cannot hide the moved card.
test('settings HTML loads the relocated card script version', () => {
  const html = fs.readFileSync('web/settings.html', 'utf8');
  assert.match(html, /src="\/assets\/settings\.js\?v=1\.2\.3\.2"/);
});
