'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { CDP, delay } = require('./cdp.cjs');

async function main() {
  const [endpoint, base, fixture, driver, output, mode, originalName] = process.argv.slice(2);
  const filename = originalName || driver + '.zip';
  const { webSocketDebuggerUrl, Browser: browserName } = await (await fetch(endpoint + '/json/version')).json();
  const browser = await new CDP(webSocketDebuggerUrl).open();
  const result = { browserName, checks: {}, external: [], errors: [] };
  fs.mkdirSync(output, { recursive: true });
  const record = (key, value) => {
    result.checks[key] = value;
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(result, null, 2));
  };
  let tab, targetId;
  try {
    ({ targetId } = await browser.send('Target.createTarget', { url: 'about:blank' }));
    const targets = await (await fetch(endpoint + '/json')).json();
    tab = await new CDP(targets.find(target => target.id === targetId).webSocketDebuggerUrl).open();
    for (const domain of ['Page', 'Runtime', 'Network']) await tab.send(domain + '.enable');
    await tab.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
    tab.listeners.push(event => {
      if (event.method === 'Runtime.exceptionThrown') result.errors.push(event.params.exceptionDetails.text);
      if (event.method !== 'Fetch.requestPaused') return;
      const { requestId, request } = event.params;
      const external = /^https?:/.test(request.url) && new URL(request.url).origin !== new URL(base).origin;
      if (external) result.external.push(request.url);
      tab.send(external ? 'Fetch.failRequest' : 'Fetch.continueRequest',
        external ? { requestId, errorReason: 'InternetDisconnected' } : { requestId }).catch(() => {});
    });
    await tab.send('Page.addScriptToEvaluateOnNewDocument', {
      source: 'window.showDirectoryPicker=undefined;window.showOpenFilePicker=undefined;\n' +
        fs.readFileSync(path.join(__dirname, 'probe.js'), 'utf8')
    });
    const poll = async (expression, ms = 45000) => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline) {
        const value = await tab.evaluate(expression);
        if (value) return value;
        await delay(250);
      }
      throw Error('Timed out waiting for ' + expression);
    };
    async function choose(role, file) {
      await tab.evaluate(`document.querySelector('[data-pick="${role}"]').click()`);
      await tab.evaluate("document.querySelector('.ng-dialog-confirm')?.click()");
      await poll("Boolean(document.querySelector('input[type=file]'))");
      const document = await tab.send('DOM.getDocument');
      const { nodeId } = await tab.send('DOM.querySelector', { nodeId: document.root.nodeId, selector: 'input[type=file]' });
      assert(nodeId, 'Fallback file input for ' + role);
      await tab.send('DOM.setFileInputFiles', { nodeId, files: [path.join(fixture, file)] });
      await delay(1500);
    }
    async function key(code) {
      for (const type of ['keyDown', 'keyUp']) {
        await tab.send('Input.dispatchKeyEvent', { type, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code });
        await delay(140);
      }
    }
    const inPlayer = js => `(async()=>{const f=document.querySelector('#ng-session-player');const w=f?.contentWindow||(location.pathname.endsWith('/player.html')?window:null);if(w?.__NGSample){${js}}})()`;
    const screenshot = async name => fs.writeFileSync(path.join(output, name + '.png'),
      Buffer.from(await tab.evaluate(inPlayer('return w.__NGFrame();')), 'base64'));
    async function boot() {
      await tab.evaluate(`document.querySelector('a[href*="rom=${filename}"]').click()`);
      await poll(inPlayer("return Boolean(w.document.querySelector('.ejs_start_button'));"));
      await tab.send('Page.bringToFront');
      await tab.send('Runtime.evaluate', {
        expression: inPlayer("w.document.querySelector('.ejs_start_button').click();"),
        awaitPromise: true,
        userGesture: true
      });
      const state = await poll(inPlayer(`
        const s=w.__NGSample();
        return s.frames>120&&s.driverLogs.some(l=>l.endsWith('Initialized driver for ${driver}'))&&s;
      `));
      assert.equal(state.errors.length + state.gpuLoss.length, 0);
      return state;
    }

    await tab.send('Page.navigate', { url: base });
    if (mode === '--offline-only') {
      let serverReachable = false;
      try {
        await fetch(base, { signal: AbortSignal.timeout(2000) });
        serverReachable = true;
      } catch {}
      assert(!serverReachable, 'Stop the static preview before the offline-only check');
      await poll(`window.NGLocal?.games.some(g=>g.driver==='${driver}'&&g.source==='browser-copy')`);
      const state = await boot();
      record('offline_boot', { driver, frames: state.frames, source: 'browser-copy', serverReachable });
      const restored = await tab.evaluate(inPlayer(`
        const e=w.EJS_emulator;
        const saved=await e.storage.states.get(e.getBaseFileName()+'.state');
        if(!saved?.length)return null;
        await e.gameManager.loadState(saved);
        return {bytes:saved.length,hash:await w.NGLocal.hash(saved)};
      `));
      assert(restored?.bytes > 0, 'No persisted save found after reopening');
      record('offline_save_restore', restored);
      const control = await tab.evaluate(inPlayer(
        'const e=w.EJS_emulator;e.elements.parent.focus(); return e.controls[0];'
      ));
      const first = await tab.evaluate(inPlayer('return w.__NGSample().frames;'));
      const prolonged = (driver === 'mslug3h' && output.includes('chrome-tail')) ||
        (driver === 'kof2k1fd' && output.includes('edge')) ||
        (driver === 'samsh5sp' && output.includes('brave-tail'));
      const durationMs = prolonged ? 90000 : driver === 'kof2k1fd' ? 25000 : 5000;
      const deadline = Date.now()+durationMs;
      while(Date.now()<deadline){
        for(const index of [7,0,8,1,6,9])await key(control[index].value);
      }
      const last = await tab.evaluate(inPlayer(
        'const s=w.__NGSample();return {frames:s.frames,errors:s.errors,gpuLoss:s.gpuLoss};'
      ));
      assert(last.frames-first>durationMs/60,'Emulation stopped after offline restore');
      assert.equal(last.errors.length+last.gpuLoss.length,0);
      await screenshot('offline-play');
      record('offline_play',{durationMs,framesAdvanced:last.frames-first});

      assert.equal(result.external.length + result.errors.length, 0);
      result.status = 'PASS';
      return;
    }
    await poll('Boolean(window.NGLocal && document.querySelector(\'[data-pick="roms"]\'))');
    record('missing_before_selection', await tab.evaluate('({games:NGLocal.games.length,bios:NGLocal.bios?.status||null})'));
    await tab.evaluate("document.querySelector('[data-guide-setup]')?.click()");
    await choose('roms', 'ROMs');
    await choose('previews', 'PREVIEWS');
    await choose('bios', 'BIOS/neogeo.zip');
    await tab.evaluate('NGLocal.save()');
    record('selection_diagnostics', await tab.evaluate('({bios:NGLocal.bios?.status, games:NGLocal.games.map(g=>g.driver), errors:NGLocal.errors, states:NGLocal.states})'));
    await poll(`NGLocal.bios?.status==='VALID'&&NGLocal.games.some(g=>g.driver==='${driver}')`);
    const details = await tab.evaluate(`NGLocal.games.find(g=>g.driver==='${driver}')`);
    record('library', { title: details.title, category: details.category, source: details.source });
    await poll(`Boolean(document.querySelector('a[href*="rom=${filename}"]'))`);
    for (const [language, direction] of [['ar', 'rtl'], ['en', 'ltr']]) {
      await tab.evaluate(`NGI18n.setLanguage('${language}')`);
      await poll(`document.documentElement.dir==='${direction}'`);
    }
    record('localization', true);
    result.stage = 'static boot';
    const start = await boot();
    record('static_boot', { frames: start.frames, audio: start.audio.nonzero, driver });
    result.stage = 'gameplay';
    await screenshot('before-input');
    const frames = () => tab.evaluate(inPlayer('return w.__NGSample().frames;'));
    await tab.evaluate(inPlayer('w.EJS_emulator.pause();'));
    await delay(400);
    const paused = await frames();
    await delay(800);
    assert.equal(await frames(), paused);
    await tab.evaluate(inPlayer('w.EJS_emulator.play();'));
    await delay(750);
    assert((await frames()) > paused);
    record('pause_resume', true);
    await delay(3500);
    const controls = await tab.evaluate(inPlayer(`
      const e=w.EJS_emulator,g=e.gameManager.functions,send=g.simulateInput.bind(g);
      w.__testInputs=[];g.simulateInput=(...args)=>{w.__testInputs.push(args);return send(...args)};
      e.elements.parent.focus();
      return e.controls[0];
    `));
    for (let i = 0; i < 3; i++) {
      await key(controls[2].value);
      await delay(700);
    }
    await screenshot('after-coin');
    await key(controls[3].value);
    await delay(1900);
    await key(controls[3].value);
    await delay(4300);
    await screenshot('after-start');
    for (const id of [4, 5, 6, 7, 0, 8, 1, 9]) await key(controls[id].value);
    const inputs = await tab.evaluate(inPlayer('return w.__testInputs;'));
    for (const id of [2, 3, 4, 5, 6, 7, 0, 8, 1, 9]) {
      for (const state of [0, 1]) assert(inputs.some(args => args[1] === id && args[2] === state), 'Missing input ' + id + '/' + state);
    }
    record('input', inputs);
    await screenshot('after-controls');
    await delay(2500);
    await key(controls[0].value);
    await delay(4200);
    await key(controls[7].value);
    await key(controls[0].value);
    await delay(1800);
    await screenshot('mission');
    const first=await frames();
    const deadline=Date.now()+16000;
    while(Date.now()<deadline){
      for(const id of [7,0,8,1,6,9,3]) await key(controls[id].value);
    }
    const last=await frames();
    assert(last-first>400,'Emulation stopped progressing during gameplay sample');
    const health=await tab.evaluate(inPlayer('const s=w.__NGSample();return {errors:s.errors,gpuLoss:s.gpuLoss};'));
    assert.equal(health.errors.length+health.gpuLoss.length,0);
    await screenshot('after-stability');
    record('stability',{milliseconds:16000,framesAdvanced:last-first,...health});
    const audio = await tab.evaluate(inPlayer('return w.__NGSample().audio;'));
    record('digital_audio', { nonzero: audio.nonzero, peak: audio.peak, states: audio.contextStates });
    await tab.send('Runtime.evaluate', {
      expression: inPlayer('w.EJS_emulator.toggleFullscreen(true);'),
      awaitPromise: true,
      userGesture: true
    });
    record('fullscreen', await tab.evaluate('Boolean(document.fullscreenElement)'));
    await tab.evaluate('document.fullscreenElement ? document.exitFullscreen() : undefined');
    const saved = await tab.evaluate(inPlayer(`
      const e=w.EJS_emulator,g=e.gameManager,bytes=g.getState(),k=e.getBaseFileName()+'.state';
      await e.storage.states.put(k,bytes);
      const stored=await e.storage.states.get(k);
      await g.loadState(stored);
      return {bytes:bytes.length,hash:await w.NGLocal.hash(bytes),storedHash:await w.NGLocal.hash(stored)};
    `));
    assert.equal(saved.hash, saved.storedHash);
    record('save_and_load', saved);
    await tab.evaluate(inPlayer(`
      const box=w.document.querySelector('#local-copy-consent');
      if(!box)return;
      box.checked=true;box.dispatchEvent(new w.Event('change'));
      w.document.querySelector('#local-copy-save').click();
    `));
    await poll(inPlayer("return w.document.querySelector('#local-copy-status')?.textContent.includes('LOCAL_COPY_SAVED');"));
    record('local_copy_for_offline', true);
    await tab.evaluate(inPlayer('w.document.querySelector("a.back-btn").click();'));
    await poll('!document.querySelector("#ng-session-player")');
    record('returned_to_library', true);
    result.stage = 'offline cache installation';
    const pack = await tab.evaluate(`(async()=>{
      const scope=new URL('./',location.href);
      await navigator.serviceWorker.register(new URL('offline-sw.js',scope),{scope:scope.href});
      const worker=(await navigator.serviceWorker.ready).active;
      return new Promise((resolve,reject)=>{
        const c=new MessageChannel();
        c.port1.onmessage=({data})=>{
          if(data.type==='progress')return;
          if(data.type==='error')reject(Error(data.message));
          else resolve(data);
        };
        worker.postMessage({command:'INSTALL'},[c.port2]);
      });
    })()`, 90000);
    assert(pack.ready, JSON.stringify(pack));
    record('offline_pack', pack);
    assert.equal(result.external.length + result.errors.length, 0);
    result.status = 'PASS';
  } catch (error) {
    result.status = 'FAIL';
    result.error = error.stack;
    if (tab) {
      const shot = await tab.send('Page.captureScreenshot').catch(() => null);
      if (shot) fs.writeFileSync(path.join(output, 'failure.png'), Buffer.from(shot.data, 'base64'));
    }
    process.exitCode = 1;
  } finally {
    tab?.close();
    if (targetId) await browser.send('Target.closeTarget', { targetId }).catch(() => {});
    browser.close();
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(result, null, 2));
    console.log(result.status, result.error || Object.keys(result.checks));
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
