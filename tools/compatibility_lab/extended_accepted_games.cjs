'use strict';
// Attach to an owner-opened test browser; keep the library document alive across two games.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { CDP, delay } = require('../browser_game_runner/cdp.cjs');

async function main() {
  const [endpoint, label, output, secondsText = '120'] = process.argv.slice(2);
  const seconds = Number(secondsText);
  assert(seconds >= 60 && seconds <= 600);
  assert(new URL(endpoint).hostname === '127.0.0.1');
  assert(!fs.existsSync(output), 'Preserve earlier evidence');
  fs.mkdirSync(output, { recursive: true });
  const version = await (await fetch(endpoint + '/json/version')).json();
  const browser = await new CDP(version.webSocketDebuggerUrl).open();
  const result = { browser: version.Browser, label, seconds, games: {}, external: [], errors: [], status: 'NOT VERIFIED' };
  let tab, targetId;
  const save = () => fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(result, null, 2));
  try {
    ({ targetId } = await browser.send('Target.createTarget', { url: 'about:blank' }));
    const targets = await (await fetch(endpoint + '/json')).json();
    tab = await new CDP(targets.find(t => t.id === targetId).webSocketDebuggerUrl).open();
    for (const domain of ['Page', 'Runtime', 'Network']) await tab.send(domain + '.enable');
    await tab.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
    tab.listeners.push(event => {
      if (event.method === 'Runtime.exceptionThrown') result.errors.push(event.params.exceptionDetails);
      if (event.method !== 'Fetch.requestPaused') return;
      const { requestId, request } = event.params;
      const external = /^https?:/.test(request.url) && new URL(request.url).origin !== 'http://127.0.0.1:8793';
      if (external) result.external.push(request.url);
      tab.send(external ? 'Fetch.failRequest' : 'Fetch.continueRequest', external
        ? { requestId, errorReason: 'InternetDisconnected' } : { requestId }).catch(() => {});
    });
    await tab.send('Page.addScriptToEvaluateOnNewDocument', { source: fs.readFileSync(path.resolve(__dirname, '../browser_game_runner/probe.js'), 'utf8') });
    const poll = async (js, ms = 60000) => {
      const end = Date.now() + ms;
      while (Date.now() < end) { const value = await tab.evaluate(js); if (value) return value; await delay(300); }
      throw Error('Timed out: ' + js);
    };
    const frame = code => `(async()=>{const w=document.querySelector('#ng-session-player')?.contentWindow||(location.pathname.endsWith('/player.html')?window:null);if(w?.__NGSample){${code}}})()`;
    await tab.send('Page.navigate', { url: 'http://127.0.0.1:8793/Neo-Geo-Web/' });
    await poll('Boolean(window.NGLocal?.ready)');
    const parentTimeOrigin = await tab.evaluate('performance.timeOrigin');
    for (const [game, driver] of [['kof2003', 'kof2k3fd'], ['mslug5', 'mslug5fd']]) {
      await poll(`window.NGLocal?.games.some(g=>g.driver==='${driver}'&&g.source==='browser-copy')`);
      await poll(`Boolean(document.querySelector('a[href*="rom=${game}.zip"]'))`);
      await tab.evaluate(`document.querySelector('a[href*="rom=${game}.zip"]').click()`);
      await poll(frame("return Boolean(w.document.querySelector('.ejs_start_button'));"));
      await tab.send('Runtime.evaluate', { expression: frame("w.document.querySelector('.ejs_start_button').click();"), userGesture: true, awaitPromise: true });
      await poll(frame(`const s=w.__NGSample();return s.frames>120&&s.driverLogs.some(l=>l.endsWith('Initialized driver for ${driver}'));`));
      const controls = await tab.evaluate(frame('w.EJS_emulator.elements.parent.focus();return w.EJS_emulator.controls[0];'));
      const first = await tab.evaluate(frame('return w.__NGSample();'));
      const samples = [];
      const end = Date.now() + seconds * 1000;
      while (Date.now() < end) {
        for (const id of [2, 3, 4, 5, 6, 7, 0, 8, 1, 9]) {
          const code = controls[id].value;
          for (const type of ['keyDown', 'keyUp']) {
            await tab.send('Input.dispatchKeyEvent', { type, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code });
            await delay(70);
          }
        }
        samples.push(await tab.evaluate(frame('return w.__NGSample();')));
        await delay(600);
      }
      const last = samples.at(-1);
      assert(last.frames - first.frames > seconds * 20, 'Frame progress stalled');
      assert(last.audio.nonzero > first.audio.nonzero, 'No active digital audio');
      assert(samples.every(s => !s.errors.length && !s.gpuLoss.length));
      const picture = await tab.evaluate(frame('return w.__NGFrame();'));
      fs.writeFileSync(path.join(output, game + '-end.png'), Buffer.from(picture, 'base64'));
      await tab.evaluate(frame('w.document.querySelector("a.back-btn").click();'));
      await poll('Boolean(window.NGLocal && document.querySelector("#collection")) && !document.querySelector("#ng-session-player")');
      const parentDocumentPreserved = (await tab.evaluate('performance.timeOrigin')) === parentTimeOrigin;
      result.games[game] = { status: 'PASS_EXTENDED_RUNTIME', driver, first, last, samples,
        parentDocumentPreserved, navigationMode: parentDocumentPreserved ? 'SESSION_IFRAME' : 'PERSISTENT_COPY_PAGE_NAVIGATION',
        returnedToLibrary: true, physicalControls: 'NOT VERIFIED', audibleAudio: 'OWNER_ACCEPTANCE_ONLY' };
      save();
    }
    assert.equal(result.errors.length + result.external.length, 0);
    result.status = 'PASS';
  } catch (error) {
    result.status = 'FAIL'; result.error = error.stack; process.exitCode = 1;
  } finally {
    save(); tab?.close();
    if (targetId) await browser.send('Target.closeTarget', { targetId }).catch(() => {});
    browser.close();
    console.log(label, result.status, result.error || 'Two extended sessions completed');
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
