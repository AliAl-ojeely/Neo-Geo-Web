'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { MessageChannel } = require('node:worker_threads');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const OLD = '1111111111111111';
const NEW = '2222222222222222';
const scope = new URL('https://example.test/Neo-Geo-Web/');
const files = ['index.html', 'settings.html', 'player.html', 'vendor/emulatorjs/data/loader.js',
  'vendor/fbneo-selected-bios/fbneo-legacy-wasm.data'].map(path => ({path, bytes: 10, sha256: 'a'.repeat(64)}));

function harness({id = OLD, remote = NEW, online = true, staticSite = true} = {}) {
  const dom = Object.fromEntries(['action', 'remove', 'status', 'detail', 'storage-site', 'update-check',
    'installed', 'published', 'count', 'size', 'verification', 'progress'].map(key => [key, {dataset:{}}]));
  const calls = {fetch:0, install:0, remove:0, update:0, confirm:0};
  const state = {id, remote, worker:OLD, corrupt:false, failure:false, defer:false};
  let decide, finish;
  const registration = {
    async update() { calls.update++; state.worker = state.remote; },
    active: {postMessage({command, expectedBuild}, [port]) {
      if (command === 'STATUS') {
        port.postMessage({type:'status', ready:!!state.id, removable:!!state.id, id:state.id,
          currentBuild:state.worker, count:5, bytes:50});
        return port.close();
      }
      if (command === 'REMOVE') {
        calls.remove++;
        state.id = null;
        port.postMessage({type:'removed'});
        return port.close();
      }
      calls.install++;
      assert.equal(expectedBuild, state.worker);
      finish = () => {
        if (state.failure) port.postMessage({type:'error', message:'OFFLINE_ASSET_CHECKSUM_MISMATCH'});
        else {
          state.id = expectedBuild;
          port.postMessage({type:'complete', ready:true, id:state.id, count:5, bytes:50});
        }
        port.close();
      };
      port.postMessage({type:'progress', completed:2, total:5, bytes:20, totalBytes:50});
      if (!state.defer) finish();
    }}
  };
  const context = {
    NG_STATIC:staticSite, isSecureContext:true, NG_BASE:scope, location:scope,
    NGI18n:{t:key=>key}, URL, MessageChannel, Event, AbortController, setTimeout, clearTimeout,
    document:{getElementById:id=>dom[id.slice('ng-offline-'.length)], addEventListener(){}, dispatchEvent(){}},
    navigator:{onLine:online, serviceWorker:{getRegistration:async()=>registration,
      register:async()=>registration, ready:Promise.resolve(registration)}},
    NGDialog:{action({onConfirm}) { calls.confirm++; return new Promise(resolve => {
      decide = value => { if (value) onConfirm(); resolve(value); };
    }); }, confirm:async()=>true},
    async fetch(url, options) {
      calls.fetch++;
      assert.equal(url.origin, scope.origin);
      assert.ok(url.searchParams.has('offline_manifest_refresh'));
      assert.equal(options.cache, 'no-store');
      if (state.networkFails) throw Error('NO_NETWORK');
      return {ok:true, json:async()=>({schema:1,id:state.remote,files,totalBytes:state.corrupt?51:50})};
    }
  };
  for (const name of ['update-manager.js', 'offline-ui.js']) {
    vm.runInNewContext(read('web/offline/' + name), context, {filename:name});
  }
  return {dom,calls,state, mount:context.NGOfflineUI.mount, approve:value=>decide(value),
    finish:()=>finish()};
}

async function until(condition) {
  for (let i=0;i<100;i++) {
    if (condition()) return;
    await new Promise(resolve=>setTimeout(resolve, 2));
  }
  assert.fail('UI did not reach expected state');
}

test('fresh installation discovers only manifest and shows one install action', async () => {
  const h=harness({id:null}); await h.mount();
  assert.equal(h.dom.action.textContent, 'offline.button');
  assert.equal(h.dom['update-check'].hidden, true);
  assert.equal(h.dom.remove.hidden, true);
  assert.equal(h.dom.published.textContent, NEW);
  assert.deepEqual(h.calls, {fetch:1, install:0, remove:0, update:0, confirm:0});
});

test('fresh installation and update share the consent and worker path', async () => {
  for (const id of [null, OLD]) {
    const h=harness({id}); await h.mount();
    const task=h.dom.action.onclick();
    await until(()=>h.calls.confirm===1);
    assert.equal(h.calls.update,0);
    h.approve(true);
    assert.equal(await task,true);
    assert.equal(h.dom.installed.textContent,NEW);
    assert.equal(h.dom.action.hidden,true);
    assert.equal(h.calls.install,1);
  }
});

test('Check for Updates transitions from up to date to one update action', async () => {
  const h=harness({remote:OLD}); await h.mount();
  assert.equal(h.dom.action.hidden,true);
  assert.equal(h.dom.remove.hidden,false);
  h.state.remote=NEW;
  await h.dom['update-check'].onclick();
  assert.equal(h.dom.action.textContent,'offline_update.update_button');
  assert.equal(h.dom.action.hidden,false);
  assert.equal(h.dom.installed.textContent,OLD);
  assert.equal(h.dom.published.textContent,NEW);
});

test('cancelled confirmation keeps prior package and restores actions', async () => {
  const h=harness(); await h.mount();
  const task=h.dom.action.onclick();
  await until(()=>h.calls.confirm===1);
  h.approve(false);
  assert.equal(await task,false);
  assert.equal(h.calls.install,0);
  assert.equal(h.calls.update,0);
  assert.equal(h.dom.action.disabled,false);
  assert.equal(h.dom.action.hidden,false);
});

test('repeated clicks are blocked during approval and verified download', async () => {
  const h=harness(); h.state.defer=true; await h.mount();
  const task=h.dom.action.onclick();
  await until(()=>h.calls.confirm===1);
  await h.dom.action.onclick();
  await h.dom['update-check'].onclick();
  await h.dom.remove.onclick();
  h.approve(true);
  await until(()=>h.dom.progress.value===40);
  assert.equal(h.dom.progress.hidden,false);
  assert.match(h.dom.detail.textContent,/40% · 2\/5/);
  assert.equal(h.dom.action.disabled,true);
  assert.equal(h.dom.remove.disabled,true);
  await h.dom.remove.onclick();
  h.finish();
  await task;
  assert.equal(h.dom.progress.hidden,true);
  assert.equal(h.calls.confirm,1);
  assert.equal(h.calls.remove,0);
  assert.equal(h.calls.install,1);
});

test('failed verification leaves current package installed and reports the error', async () => {
  const h=harness(); h.state.failure=true; await h.mount();
  const task=h.dom.action.onclick();
  await until(()=>h.calls.confirm===1);
  h.approve(true);
  assert.equal(await task,false);
  assert.equal(h.dom.installed.textContent,OLD);
  assert.equal(h.dom.action.disabled,false);
  assert.match(h.dom.status.textContent,/CHECKSUM_MISMATCH/);
  assert.equal(h.dom.progress.hidden,true);
});

test('changed published build after approval requires separate consent', async () => {
  const h=harness(); await h.mount();
  const task=h.dom.action.onclick();
  await until(()=>h.calls.confirm===1);
  h.state.remote='3333333333333333';
  h.approve(true);
  assert.equal(await task,false);
  assert.equal(h.calls.update,0);
  assert.equal(h.calls.install,0);
  assert.match(h.dom.status.textContent,/changed_retry/);
});

test('invalid manifest and network failure leave installed package and never start downloads', async () => {
  for (const key of ['corrupt','networkFails']) {
    const h=harness(); h.state[key]=true; await h.mount();
    assert.equal(h.dom.installed.textContent,OLD);
    assert.match(h.dom.status.textContent,/offline_update.unavailable/);
    assert.equal(h.dom.action.hidden,true);
    assert.equal(h.calls.install,0);
  }
});

test('offline reopen and nonstatic settings do not initiate network requests', async () => {
  const offline=harness({online:false}); await offline.mount();
  assert.equal(offline.dom.installed.textContent,OLD);
  assert.match(offline.dom.status.textContent,/offline_update.offline/);
  assert.equal(offline.calls.fetch,0);
  const local=harness({staticSite:false}); await local.mount();
  assert.equal(local.dom.action.disabled,true);
  assert.equal(local.calls.fetch,0);
});

test('removal returns to Install and preserves published build information', async () => {
  const h=harness({remote:OLD}); await h.mount();
  await h.dom.remove.onclick();
  assert.equal(h.calls.remove,1);
  assert.equal(h.dom.remove.hidden,true);
  assert.equal(h.dom.action.hidden,false);
  assert.equal(h.dom.published.textContent,OLD);
  assert.match(h.dom.status.textContent,/offline.removed/);
});

test('one settings panel, progress indicator and primary action with bilingual labels', () => {
  const settings=read('web/settings.js');
  for (const id of ['action','progress','status']) {
    assert.equal(settings.split('id="ng-offline-'+id+'"').length-1,1);
  }
  assert.doesNotMatch(settings,/ng-offline-update-(apply|detail|status)|NGOfflineUpdateUI/);
  assert.match(read('web/languages.js'),/Offline Manager.*مدير التشغيل دون إنترنت/);
  assert.doesNotMatch(read('web/index.html'),/offline\/update-manager\.js/);
});
