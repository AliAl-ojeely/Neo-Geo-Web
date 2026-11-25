'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = {};
vm.runInNewContext(read('web/ui/arcade-home.js'), app);
const catalog = JSON.parse(read('web/data/catalog.json')).games;

test('series filters count exact catalog identities without including modified clones', () => {
  const expected = { kof: 10, 'metal-slug': 6, samurai: 6 };
  for (const [id, count] of Object.entries(expected)) {
    const found = catalog.filter(game => app.NGArcade.matches(id, game));
    assert.equal(found.length, count);
    assert(found.every(game => app.NGArcade.seriesFor(game).id === id));
  }
  assert.equal(app.NGArcade.matches('kof', { id: 'kof97-5a' }), false);
  assert.equal(app.NGArcade.matches('metal-slug', { id: 'mslug3-5a' }), false);
});

test('featured choices prefer last played and are limited to linked games', () => {
  const game = id => catalog.find(item => item.id === id);
  assert.equal(app.NGArcade.choose([], null), null);
  assert.equal(app.NGArcade.choose([game('kof98'), game('mslug')], null).id, 'kof98');
  assert.equal(app.NGArcade.choose([game('kof98'), game('mslug')], game('mslug')).id, 'mslug');
  assert.equal(app.NGArcade.choose([game('garou')], null).id, 'garou');
});

test('homepage keeps rendering and library contracts with isolated design assets', () => {
  const home = read('web/index.html');
  for (const id of ['game-grid','featured-image','featured-title','collection','search','sort','ng-load-more-btn','ng-game-progress'])
    assert.equal((home.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1);
  for (const other of ['web/player.html','web/settings.html']) assert.doesNotMatch(read(other), /arcade-(?:home|renaissance)/);
  assert.match(home, /arcade-renaissance\.css/);
  assert.match(home, /arcade-home\.js/);
  assert.match(read('web/ui/arcade-renaissance.css'), /aspect-ratio:\s*4\s*\/\s*3/);
  assert.match(read('web/ui/arcade-renaissance.css'), /prefers-reduced-motion: reduce/);
});
