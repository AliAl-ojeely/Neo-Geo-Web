'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');

// Keep the one-click header refresh completely removed without harming local-library rescans.
const read = path => fs.readFileSync(path, 'utf8');
const html = read('web/index.html');
const app = read('web/app.js');
const extras = read('web/ui/site-extras.js');
const css = read('web/style.css');
const languages = read('web/languages.js');
const library = read('web/library/library-ui.js');

assert.doesNotMatch(html, /\bid=["']refresh["']/);
assert.doesNotMatch(html, /\bheader-refresh\b|\brefresh-glyph\b|index\.refresh_game_list|index\.refresh_library/);
assert.doesNotMatch(app, /\$\(['"]refresh['"]\)/);
assert.doesNotMatch(extras, /getElementById\(['"]refresh['"]\)|is-refreshing|feedbackTimeout/);
assert.doesNotMatch(css, /header-refresh|refresh-glyph|ng-refresh-feedback/);
assert.doesNotMatch(languages, /refresh_game_list:|refresh_library:/);
assert.match(app, /function load\(/);
assert.match(app, /ng-library-changed/);
assert.match(library, /library-scan/);
assert.match(html, /href=["']\/settings\.html["']/);
console.log('PASS: obsolete header refresh removed; local library scan and startup remain');
