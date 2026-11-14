'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'web/offline/update-manager.js'), 'utf8');
const HASH = 'a'.repeat(64);
const required = [
  'index.html', 'settings.html', 'player.html',
  'vendor/emulatorjs/data/loader.js',
  'vendor/fbneo-selected-bios/fbneo-legacy-wasm.data'
];
const OLD = '1111111111111111';
const NEW = '2222222222222222';
function manifest(id = NEW) {
  return {schema:1,id,files:required.map(p=>({path:p,bytes:10,sha256:HASH})),totalBytes:50};
}
function harness({pack=true,remote=NEW,online=true,staticSite=true}={}) {
  const site = 'https://example.test/Neo-Geo-Web/';
  const dom = {};
  for (const [name,id] of Object.entries({
    check:'ng-offline-update-check',apply:'ng-offline-update-apply',
    status:'ng-offline-update-status',detail:'ng-offline-update-detail'
  })) dom[id] = {hidden:name==='apply',disabled:false,textContent:'',dataset:{}};
  const events = new Map();
  const document = {getElementById: id=>dom[id] || null,
    addEventListener:(k,cb)=>events.set(k,cb)};
  let statusId=OLD,workerId=OLD;
  let fetchCalls=0, workerUpdates=0, approvals=0, confirmed=0;
  let latest = manifest(remote);
  const installed = () => pack ? {type:'status',ready:true,id:statusId,bytes:120,
    count:6,currentBuild:workerId} : {type:'status',ready:false,removable:false,currentBuild:workerId};
  const registration={update:async()=>{workerUpdates++;workerId=latest.id;}};
  let captured = null;
  const api = {status:async()=>installed(),
    confirmInstall:async before=>{approvals++;captured=before;return true;}};
  const ctx = {
    NG_STATIC:staticSite,NG_BASE:new URL(site),location:new URL(site),
    NGI18n:{t:x=>x},NGOfflineUI:api,
    navigator:{onLine:online,serviceWorker:{getRegistration:async()=>registration}},
    document,URL,Set,Object,Number,Date,Promise,Error,
    fetch:async (url,opts)=>{
      fetchCalls++;
      assert.equal(new URL(url).origin,new URL(site).origin);
      assert.equal(new URL(url).searchParams.has('offline_manifest_refresh'),true);
      assert.equal(opts.cache,'no-store');
      if(!online)throw Error('NO_NETWORK');
      return {ok:true,type:'basic',json:async()=>latest};
    },setTimeout,clearTimeout,console
  };
  vm.runInNewContext(code,ctx,{filename:'update-manager.js'});
  return {api:ctx.NGOfflineUpdateUI,dom,events,
    state:()=>({fetchCalls,workerUpdates,approvals,confirmed}),
    approve:async()=>{assert(captured);confirmed++;await captured();},
    change:(id)=>{latest=manifest(id);},
    bad:(item)=>{latest=item;},
    setInstalled:(value)=>{statusId=value;},
    setPack:(value)=>{pack=value;},
    setOnline:(value)=>{online=value;ctx.navigator.onLine=value;}};
}
const settle = () => new Promise(resolve=>setImmediate(resolve));

test('no offline package: no network request, worker update or download',async()=>{
  const h=harness({pack:false});h.api.mount();await settle();
  assert.equal(h.state().fetchCalls,0);
  assert.equal(h.state().workerUpdates,0);
  assert.equal(h.dom['ng-offline-update-apply'].hidden,true);
});
test('installed package: compares fresh server manifest ID and offers opt-in',async()=>{
  const h=harness();h.api.mount();await settle();
  assert.equal(h.state().fetchCalls,1);
  assert.match(h.dom['ng-offline-update-status'].textContent,/available/);
  assert.equal(h.dom['ng-offline-update-apply'].hidden,false);
  assert.match(h.dom['ng-offline-update-detail'].textContent,/1111111111111111/);
  assert.match(h.dom['ng-offline-update-detail'].textContent,/2222222222222222/);
  assert.equal(h.state().approvals,0);
  assert.equal(h.state().workerUpdates,0);
});
test('no newer build: never offers an update button',async()=>{
  const h=harness({remote:OLD});h.api.mount();await settle();
  assert.match(h.dom['ng-offline-update-status'].textContent,/up_to_date/);
  assert.equal(h.dom['ng-offline-update-apply'].hidden,true);
});
test('offline network errors keep installed package and never start writes',async()=>{
  const h=harness({online:false});h.api.mount();await settle();
  assert.equal(h.state().fetchCalls,0,'automatic check skips network when offline');
  await h.api.check();
  assert.equal(h.state().fetchCalls,1);
  assert.equal(h.state().workerUpdates,0);
  assert.equal(h.dom['ng-offline-update-apply'].hidden,true);
  assert.match(h.dom['ng-offline-update-status'].textContent,/unavailable/);
});
test('invalid manifest cannot enable update',async()=>{
  const h=harness();h.bad({...manifest(),totalBytes:51});h.api.mount();await settle();
  assert.equal(h.dom['ng-offline-update-apply'].hidden,true);
  assert.equal(h.state().approvals,0);
});
test('update starts only after existing confirmation and refreshes SW first',async()=>{
  const h=harness();h.api.mount();await settle();
  await h.dom['ng-offline-update-apply'].onclick();
  assert.equal(h.state().approvals,1);
  assert.equal(h.state().workerUpdates,0);
  await h.approve();
  assert.equal(h.state().workerUpdates,1);
  assert.match(h.dom['ng-offline-update-status'].textContent,/downloading/);
});
test('changed manifest after confirmation rejects before worker update',async()=>{
  const h=harness();h.api.mount();await settle();
  await h.dom['ng-offline-update-apply'].onclick();
  h.change('3333333333333333');
  await assert.rejects(h.approve(),/changed_retry/);
  assert.equal(h.state().workerUpdates,0);
});
test('finished update clears pending state and reports the new installed build',async()=>{
  const h=harness();h.api.mount();await settle();
  await h.dom['ng-offline-update-apply'].onclick();
  await h.approve();
  h.setInstalled(NEW);
  h.events.get('ng-offline-pack-finished')();
  await settle();
  assert.match(h.dom['ng-offline-update-status'].textContent,/up_to_date/);
  assert.equal(h.dom['ng-offline-update-apply'].hidden,true);
});
test('no static hosting cannot register worker or download packages',async()=>{
  const h=harness({staticSite:false});h.api.mount();await settle();
  assert.equal(h.state().fetchCalls,0);
  assert.equal(h.state().workerUpdates,0);
  assert.equal(h.dom['ng-offline-update-check'].disabled,true);
});
test('integration is settings-only and reuses validated SW staging',()=>{
  const read=p=>fs.readFileSync(path.join(root,p),'utf8');
  assert.match(read('web/settings.js'),/NGOfflineUpdateUI\?\.mount\(\)/);
  assert.match(read('web/settings.js'),/id="ng-offline-update-check"/);
  assert.match(read('web/settings.html'),/offline\/update-manager\.js\?v=1\.7\.0/);
  assert.match(read('web/offline/offline-ui.js'),/confirmInstall\s*\}/);
  assert.match(read('web/languages.js'),/offline_update:\s*\{/);
  const sw=read('tools/offline-sw.template.js');
  assert.match(sw,/fetchVerifiedAsset/);
  assert.match(sw,/Keep the active package untouched/);
  assert.doesNotMatch(read('web/index.html'),/offline\/update-manager\.js/);
});
