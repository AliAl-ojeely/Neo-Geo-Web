'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const repo = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(repo, rel), 'utf8');

test('settings page has one Library nav link without redundant Back to library', () => {
  const html = read('web/settings.html');
  assert.match(html, /<a href="\/" data-i18n-text="index\.library">Library<\/a>/);
  assert.doesNotMatch(html, /<a href="\/" class="header-link return-link"/);
  assert.doesNotMatch(html, /data-i18n-text="player\.back_to_library"/);
});

test('settings page references versioned JS for the installed paging setting', () => {
  const html = read('web/settings.html');
  for (const [name, version] of [['languages.js', '1.7.0'], ['preferences.js', '1.3.2']]) {
    const escapedVersion = version.replace(/\./g, '\\.');
    assert.match(html, new RegExp('src="/assets/' + name.replace('.', '\\.') + '\\?v=' + escapedVersion + '"'));
  }
  assert.match(html, /src="\/assets\/settings\.js\?v=1\.7\.0"/);
});

test('More options really renders the Load More Games preference', () => {
  const source = read('web/settings.js');
  const preferences = read('web/preferences.js');
  const languages = read('web/languages.js');
  assert.match(source, /misc:\s*\(\)\s*=>\s*\[\s*\/\/ Library paging/);
  assert.match(source, /toggle\('loadMoreGames', NGI18n\.t\('settings\.library_load_more_enable'\)\)/);
  assert.match(preferences, /loadMoreGames:\s*true/);
  assert.match(preferences, /'loadMoreGames'/);
  assert.match(languages, /library_load_more_title:\s*\{/);
  assert.match(languages, /library_load_more_enable:\s*\{/);
});

test('both pagination modes keep their existing animation call', () => {
  const app = read('web/app.js');
  assert.match(app, /const paging = window\.NGPrefs\?\.load\(\)\?\.loadMoreGames !== false/);
  assert.match(app, /const shown = Math\.min\(paging \? state\.visibleCount : games\.length, games\.length\)/);
  assert.match(app, /more\.hidden = shown >= games\.length/);
  assert.match(app, /NGLibraryMotion\?\.reveal/);
  const motion = read('web/ui/library-motion.js');
  for (const type of ['rise', 'side', 'scale']) assert(motion.includes("'" + type + "'"));
});
