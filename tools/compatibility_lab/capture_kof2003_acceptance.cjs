'use strict';
// Run by the tester against an explicitly opened, dedicated browser profile.
// The helper records human observations separately from digital runtime measurements.
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline/promises');
const { CDP } = require('../browser_game_runner/cdp.cjs');

async function main() {
  const [endpoint, browserLabel, runLabel, game = 'kof2003'] = process.argv.slice(2);
  const drivers = { kof2003: 'kof2k3fd', mslug5: 'mslug5fd' };
  if (!drivers[game] || !['chrome', 'brave', 'edge'].includes(browserLabel) || !/^[a-zA-Z0-9_-]+$/.test(runLabel || '')) {
    throw Error('Usage: node capture_kof2003_acceptance.cjs http://127.0.0.1:9381 chrome manual-01');
  }
  const url = new URL(endpoint);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') throw Error('Loopback CDP only');
  const root = path.resolve(__dirname, '../..');
  const out = path.join(root, 'work/recovery/kof2003-acceptance/evidence', browserLabel, 'candidate-' + game, runLabel, 'manual');
  if (fs.existsSync(out)) throw Error('Use a new run label to preserve previous evidence');
  fs.mkdirSync(out, { recursive: true });
  const version = await (await fetch(endpoint + '/json/version')).json();
  const browser = await new CDP(version.webSocketDebuggerUrl).open();
  const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
  const result = { status: 'NOT VERIFIED', game, driver: drivers[game], browserLabel, browserVersion: version.Browser,
    started: new Date().toISOString(), observed: {}, external: [], errors: [] };
  let tab;
  const write = () => fs.writeFileSync(path.join(out, 'manual-results.json'), JSON.stringify(result, null, 2));
  try {
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
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
    await tab.send('Page.addScriptToEvaluateOnNewDocument', {
      source: fs.readFileSync(path.join(root, 'tools/browser_game_runner/probe.js'), 'utf8')
    });
    await tab.send('Page.navigate', { url: 'http://127.0.0.1:8793/Neo-Geo-Web/' });
    await tab.send('Page.bringToFront');
    const frame = code => `(async()=>{const w=document.querySelector('#ng-session-player')?.contentWindow||window;if(!w.__NGSample)return null;${code}})()`;
    // Capture real character-selection and fighting screens, rather than inferring them from frame counts.
    const playStage = game === 'kof2003' ? 'actual-fight' : 'actual-mission';
    for (const stage of ['character-selection', playStage, 'after-directions-and-ABCD']) {
      const answer = await terminal.question(`Play ${game} until ${stage}. Type YES only when visible, or NO: `);
      result.observed[stage] = answer.trim().toUpperCase() === 'YES' ? 'HUMAN_CONFIRMED' : 'NOT VERIFIED';
      result[stage] = await tab.evaluate(frame('return w.__NGSample();'));
      const shot = await tab.evaluate(frame('return w.EJS_emulator?.started ? await w.__NGFrame() : null;'));
      if (shot) fs.writeFileSync(path.join(out, stage + '.png'), Buffer.from(shot, 'base64'));
      write();
    }
    for (const question of ['audible-game-audio', 'directions-respond-in-fight', 'ABCD-respond-in-fight', 'graphics-correct']) {
      const answer = await terminal.question(`${question}: type YES only if personally verified, or NO: `);
      result.observed[question] = answer.trim().toUpperCase() === 'YES' ? 'HUMAN_CONFIRMED' : 'NOT VERIFIED';
    }
    result.finalSample = await tab.evaluate(frame('return w.__NGSample();'));
    const s = result.finalSample;
    result.digitalAudio = s?.audio?.nonzero > 0 && s?.audio?.peak > 0 ? 'PASS' : 'NOT VERIFIED';
    result.driverObserved = Boolean(s?.driverLogs?.some(l => l.endsWith('Initialized driver for ' + drivers[game])));
    const samples = ['character-selection', playStage, 'after-directions-and-ABCD'].map(k => result[k]);
    const validSamples = samples.every(v => v?.frames > 0 && !v.errors.length && !v.gpuLoss.length);
    result.status = Object.values(result.observed).every(v => v === 'HUMAN_CONFIRMED') && validSamples &&
      result.driverObserved && result.digitalAudio === 'PASS' && !result.errors.length && !result.external.length
      ? 'MANUAL_OBSERVATIONS_COMPLETE_REVIEW_REQUIRED' : 'NOT VERIFIED';
    console.log(result.status, out);
    console.log('Review the screenshots; this does not promote the game or replace offline/save/fullscreen checks.');
  } catch (error) {
    result.status = 'FAIL';
    result.error = error.stack || String(error);
    throw error;
  } finally {
    write();
    terminal.close();
    // Leave the game tab open for the tester, but disconnect instrumentation so it cannot stall requests.
    if (tab) await tab.send('Fetch.disable').catch(() => {});
    tab?.close();
    browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
