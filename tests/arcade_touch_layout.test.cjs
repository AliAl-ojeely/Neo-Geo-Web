'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalize, orientationSession, touchRouter } = require('../web/ui/arcade-touch-layout.js');

test('touch preferences are restored with safe bounds and sensible defaults', () => {
  const defaults = normalize(null);
  assert.deepEqual(defaults, { joystick:100, action:100, auxiliary:100, spacing:4, opacity:100, position:'center' });
  assert.deepEqual(normalize({ joystick:999, action:'91', spacing:-2, opacity:'', position:'left' }),
    { joystick:120, action:91, auxiliary:100, spacing:2, opacity:100, position:'center' });
  assert.deepEqual(normalize(JSON.parse(JSON.stringify(defaults))), defaults);
});

test('fullscreen is requested immediately and orientation locks afterwards', async () => {
  const doc = {}, calls = [];
  const game = { requestFullscreen() { calls.push('fullscreen'); doc.fullscreenElement = game; } };
  doc.exitFullscreen = async () => { calls.push('exit'); doc.fullscreenElement = null; };
  const session = orientationSession(game, doc, { orientation: {
    async lock(value) { calls.push(value); },
    unlock() { calls.push('unlock'); }
  } });
  const pending = session.enter();
  assert.deepEqual(calls, ['fullscreen']);
  assert.equal(await pending, true);
  assert.deepEqual(calls, ['fullscreen','landscape']);
  await session.exit();
  assert.deepEqual(calls, ['fullscreen','landscape','unlock','exit']);
});

test('denied and unsupported orientation leave the session playable', async () => {
  const doc = {};
  const game = { requestFullscreen() { doc.fullscreenElement = game; } };
  let unlocked = 0;
  const failed = orientationSession(game, doc, { orientation: {
    async lock() { throw Error('denied'); },
    unlock() { unlocked++; }
  } });
  assert.equal(await failed.enter(), false);
  assert.equal(failed.active(), true);
  failed.release();
  assert.equal(unlocked, 0);
  assert.equal(await orientationSession({}, {}, {}).enter(), false);
  assert.equal(await orientationSession({ async requestFullscreen() { throw Error('blocked'); } }, {}, {}).enter(), false);
});

test('a lock resolving after fullscreen exit is released', async () => {
  const doc = {};
  const game = { requestFullscreen() { doc.fullscreenElement = game; } };
  doc.exitFullscreen = () => { doc.fullscreenElement = null; };
  let resolve, unlocked = 0;
  const session = orientationSession(game, doc, { orientation: {
    lock() { return new Promise(done => { resolve = done; }); },
    unlock() { unlocked++; }
  } });
  const pending = session.enter();
  await Promise.resolve();
  await session.exit();
  resolve();
  assert.equal(await pending, false);
  assert.equal(unlocked, 1);
});


test('coin, start and touch directions follow the selected port while keyboard and speed controls retain their route', () => {
  const sent = [];
  const route = touchRouter((...value) => sent.push(value));
  const p1 = route.snapshot();
  route.run(p1, () => route.dispatch(0, 2, 1));
  route.run(p1, () => route.dispatch(0, 2, 0));
  route.select(1);
  const p2 = route.snapshot();
  route.run(p2, () => {
    for (const id of [2, 3, 7, 8]) route.dispatch(0, id, 1);
    route.dispatch(0, 27, 1);
  });
  route.dispatch(0, 7, 1);
  route.select(0);
  route.run(p2, () => route.dispatch(0, 7, 0));
  assert.deepEqual(sent, [
    [0,2,1],[0,2,0],[1,2,1],[1,3,1],[1,7,1],[1,8,1],[0,27,1],[0,7,1],
    [1,2,0],[1,3,0],[1,7,0],[1,8,0],[0,27,0]
  ]);
});

test('interrupting touch input invalidates delayed releases and leaves physical ports unchanged', () => {
  const sent = [];
  const route = touchRouter((...data) => sent.push(data));
  const active = route.snapshot();
  route.run(active, () => route.dispatch(0, 3, 1));
  route.release();
  route.run(active, () => route.dispatch(0, 3, 0));
  route.dispatch(1, 3, 1);
  assert.deepEqual(sent, [[0,3,1],[0,3,0],[1,3,1]]);
  assert.equal(normalize({ auxiliary: 199 }).auxiliary, 120);
});

test('the responsive touch toolbar supplies an exclusive player selector and scales auxiliary hit targets', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
  const player = read('web/player.html'), css = read('web/ui/arcade-touch-controls.css');
  assert.match(player, /data-touch-player="0" aria-pressed="true"/);
  assert.match(player, /data-touch-player="1" aria-pressed="false"/);
  assert.match(player, /name="auxiliary" min="85" max="120"/);
  assert.match(css, /\.ejs_virtualGamepad_bottom \.ng-touch-coin/);
  assert.match(css, /\.ng-touch-coin > span \{ pointer-events: none/);
  assert.match(css, /orientation: landscape/);
  assert.match(css, /max-width: 420px.*orientation: portrait/);
});
