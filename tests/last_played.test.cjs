'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const read = path => fs.readFileSync(path, 'utf8');

function runtime(store = new Map(), forbid = false) {
  const window = { localStorage: {
    getItem(key) { if (forbid) throw Error('storage unavailable'); return store.get(key) ?? null; },
    setItem(key, value) { if (forbid) throw Error('storage unavailable'); store.set(key, value); }
  }};
  vm.runInNewContext(read('web/library/last-played.js'), {window, Date});
  return { api: window.NGLastPlayed, store };
}

test('stores only the stable last-started ROM filename and timestamp', () => {
  const {api, store} = runtime();
  assert.equal(api.read(), null);
  assert.equal(api.record('kof98.zip'), true);
  assert.equal(api.read().filename, 'kof98.zip');
  const record = JSON.parse(store.get('neogeo-last-played-v1'));
  assert.deepEqual(Object.keys(record).sort(), ['filename', 'playedAt']);
  assert.equal(typeof record.playedAt, 'number');
  assert.equal(api.record('mslug3.zip'), true);
  assert.equal(api.read().filename, 'mslug3.zip');
});

test('persists across independent same-origin tabs but does not keep game files', () => {
  const store = new Map();
  runtime(store).api.record('garou.zip');
  assert.equal(runtime(store).api.read().filename, 'garou.zip');
  assert.doesNotMatch(store.get('neogeo-last-played-v1'), /C:|D:|handle|bios|romData/);
});

test('ignores bad input, broken records and unavailable storage', () => {
  const env = runtime();
  for (const invalid of ['../../bios.zip', 'rom.exe', '.secret.zip', null, '', 123])
    assert.equal(env.api.record(invalid), false);
  for (const stored of ['{bad', JSON.stringify({filename: '../../bios.zip'}), 'null']) {
    env.store.set('neogeo-last-played-v1', stored);
    assert.equal(env.api.read(), null);
  }
  assert.equal(runtime(new Map(), true).api.record('kof98.zip'), false);
  assert.equal(runtime(new Map(), true).api.read(), null);
});

test('feature prioritizes last-played game over static pick and updates its image/button', () => {
  const source = read('web/app.js');
  const start = source.indexOf('function feature() {');
  const end = source.indexOf('\n\n// Load browser-linked', start);
  assert(start > 0 && end > start, 'hero function must be extractable');
  const snippet = source.slice(start, end);
  const elements = {
    'featured-title': { textContent:'', setAttribute(){} },
    'featured-description': {textContent:''},
    'featured-play': { href:'' },
    'feature-placeholder': {hidden:true},
    'featured-image': {hidden:false, dataset:{}, removeAttribute(){this.src='';}, addEventListener(type,cb){this.onerrorCallback=cb;}, src:''}
  };
  const games = [
    {id:'kof98',filename:'kof98.zip',title:'The King of Fighters 98',screenshot:'kof98.png'},
    {id:'mslug',filename:'mslug.zip',title:'Metal Slug',screenshot:'mslug.png'},
    {id:'nomedia',filename:'nomedia.zip',title:'Game Without Preview',screenshot:null}
  ];
  let selected = 'mslug.zip';
  const context = {
    state:{games},
    window:{ NGLastPlayed:{read:()=>selected ? {filename:selected} : null}, NG_STATIC:false },
    NGI18n:{t:key=>key},
    $:id=>elements[id],
    gameLink:g=>'./player.html?rom='+g.filename,
    shot:g=>'/api/shot/'+g.screenshot,
    NGPreviews:{attach(img,shot){img.src='local://'+shot;}}
  };
  vm.createContext(context);
  vm.runInContext(snippet+'\nfeature();', context);
  assert.equal(elements['featured-title'].textContent, 'Metal Slug');
  assert.equal(elements['featured-play'].href, './player.html?rom=mslug.zip');
  assert.equal(elements['featured-image'].src, '/api/shot/mslug.png');
  assert.equal(elements['featured-description'].textContent, 'app.last_played_game_description');
  selected = 'nomedia.zip';
  vm.runInContext('feature()', context);
  assert.equal(elements['featured-title'].textContent, 'Game Without Preview');
  assert.equal(elements['featured-image'].hidden, true);
  assert.equal(elements['feature-placeholder'].hidden, false);
  selected = null;
  vm.runInContext('feature()', context);
  assert.equal(elements['featured-title'].textContent, 'The King of Fighters 98');
  assert.equal(elements['featured-description'].textContent, 'app.a_verified_arcade_game_from_your_local');
});

test('player hook records only after start and both pages load one shared module', () => {
  const index = read('web/index.html'), player = read('web/player.html');
  const js = read('web/player.js'), app = read('web/app.js'), languages = read('web/languages.js');
  for (const page of [index, player]) {
    assert.match(page, /src="\/assets\/library\/last-played\.js" defer/);
    const last = page.indexOf('last-played.js');
    const next = page.indexOf(page === index ? 'src="/assets/app.js"' : 'src="/assets/player.js"');
    assert(last > 0 && last < next);
  }
  assert.match(js, /window\.EJS_onGameStart = \(\) => \{[\s\S]{0,250}if \(!diag\.report\.failureStage\) window\.NGLastPlayed\?\.record\(game\?\.filename\)/);
  assert.match(app, /addEventListener\('ng-library-return', feature\)/);
  assert.match(languages, /last_played_game_description:\s*\{ en: '[^']+', ar: '[^']+' \}/);
});
