'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createHash, webcrypto} = require('node:crypto');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'tools/offline-sw.template.js'), 'utf8');
const site = 'https://example.invalid/Neo-Geo-Web/';

function fakeWorker(corrupt = false, badTotal = false) {
  const contents = new Map([
    ['index.html','HOME'], ['settings.html','SETTINGS'], ['player.html','PLAYER'],
    ['assets/offline/offline-ui.js','SCRIPT'],
    ['vendor/emulatorjs/data/loader.js','LOADER'],
    ['vendor/fbneo-selected-bios/fbneo-legacy-wasm.data','CORE']
  ]);
  const files = [...contents].map(([path, body]) => ({path, bytes:Buffer.byteLength(body),sha256:createHash('sha256').update(body).digest('hex')}));
  if (corrupt) files[3].sha256 = '0'.repeat(64);
  const manifest = {schema:1,id:'fixture-v1',files,totalBytes:files.reduce((n,f)=>n+f.bytes,0) + (badTotal ? 1 : 0)};
  const maps=new Map(), handlers=new Map();
  let online=true, count=0, failedPath=null;
  const caches={
    has:async n=>maps.has(n),delete:async n=>maps.delete(n),keys:async()=>[...maps.keys()],
    open:async name=>{
      if(!maps.has(name))maps.set(name,new Map());
      const records=maps.get(name);
      return {
        match:async req=>records.get(String(req.url||req))?.clone(),
        put:async(req,res)=>records.set(String(req.url||req),res.clone()),
        delete:async req=>records.delete(String(req.url||req)),
        keys:async()=>[...records.keys()].map(u=>new Request(u))
      };
    }
  };
  const fetch=async input=>{
    count++;
    if(!online)throw Error('NETWORK_FORBIDDEN');
    const key=new URL(input.url||input).pathname.slice(new URL(site).pathname.length);
    if(key==='offline-manifest.json')return new Response(JSON.stringify(manifest));
    if(key === failedPath) throw Error('SIMULATED_ASSET_DOWNLOAD_FAILURE');
    return contents.has(key)?new Response(contents.get(key)):new Response('missing',{status:404});
  };
  const self={registration:{scope:site},skipWaiting:async()=>{},clients:{claim:async()=>{}},addEventListener:(name,cb)=>handlers.set(name,cb)};
  vm.runInNewContext(source.replace('__NG_OFFLINE_BUILD_ID__',manifest.id),{self,caches,fetch,crypto:webcrypto,URL,Request,Response,Uint8Array,Promise,Map,Set,Date,Error,Number,String,console});
  async function send(command){let work;const messages=[];handlers.get('message')({ports:[{postMessage:x=>messages.push(x)}],data:{command},waitUntil:p=>work=p});await work;return messages;}
  async function get(path){let response;handlers.get('fetch')({request:new Request(new URL(path,site)),respondWith:p=>response=p});return response;}
  async function removeCached(path) {
    const meta = maps.get('neogeo-static-offline-meta-v1');
    const state = JSON.parse(await meta.get(new URL('__neogeo_offline_state__',site).href).clone().text());
    return maps.get(state.cacheName).delete(new URL(path,site).href);
  }
  return {send,get,offline:()=>online=false,count:()=>count,failOn:path=>{failedPath=path;},
    removeCached,cacheNames:()=>[...maps.keys()]};
}

test('the UI, bilingual labels and static builder include fully offline assets',()=>{
  const file=name=>fs.readFileSync(path.join(root,name),'utf8');
  assert.match(file('web/settings.js'),/id="ng-offline-action"/);
  assert.match(file('web/settings.html'),/offline\/offline-ui\.js/);
  assert.match(file('web/languages.js'),/دون الحاجة الى الاتصال بالانترنت بشكل كامل/);
  assert.match(file('app/web_distribution.py'),/offline-manifest\.json/);
});

test('offline package is verified and pages/core are served without network calls',async()=>{
  const w=fakeWorker();
  const events=await w.send('INSTALL');
  assert.equal(events.at(-1).type,'complete');
  assert.equal(events.filter(x=>x.type==='progress').length,6);
  assert.equal((await w.send('STATUS')).at(-1).ready,true);
  w.offline();const before=w.count();
  assert.equal(await(await w.get('')).text(),'HOME');
  assert.equal(await(await w.get('settings.html')).text(),'SETTINGS');
  assert.equal(await(await w.get('player.html?rom=demo.zip')).text(),'PLAYER');
  assert.equal(await(await w.get('vendor/fbneo-selected-bios/fbneo-legacy-wasm.data')).text(),'CORE');
  assert.equal(w.count(),before);
  const unknown = await w.get('unknown.js');
  assert.equal(unknown.status,503,'strict offline mode must never fetch missing assets');
  assert.equal(w.count(),before,'a missing static file must not touch the network');
  assert.equal((await w.send('REMOVE')).at(-1).type,'removed');
  assert.equal((await w.send('STATUS')).at(-1).ready,false);
});

test('corrupt downloaded bytes cannot activate a partial package',async()=>{
  const w=fakeWorker(true);
  assert.match((await w.send('INSTALL')).at(-1).message,/CHECKSUM_MISMATCH/);
  assert.equal((await w.send('STATUS')).at(-1).ready,false);
});

test('no background cache of application files without user activation',async()=>{
  const w=fakeWorker();
  assert.equal(await(await w.get('index.html')).text(),'HOME');
  w.offline();await assert.rejects(w.get('index.html'),/NETWORK_FORBIDDEN/);
});

test('an interrupted repair preserves previously saved files instead of deleting active cache',async()=>{
  const w=fakeWorker();
  assert.equal((await w.send('INSTALL')).at(-1).type,'complete');
  assert.equal(await w.removeCached('player.html'),true);
  assert.equal((await w.send('STATUS')).at(-1).ready,false);
  w.failOn('vendor/emulatorjs/data/loader.js');
  assert.match((await w.send('INSTALL')).at(-1).message,/SIMULATED_ASSET_DOWNLOAD_FAILURE/);
  assert.equal(w.cacheNames().filter(x=>x.startsWith('neogeo-static-offline-v1-')).length,1,
    'failed staging cache must be removed without deleting original cache');
  w.offline();const requestsBefore=w.count();
  assert.equal(await(await w.get('index.html')).text(),'HOME');
  assert.equal(await(await w.get('settings.html')).text(),'SETTINGS');
  assert.equal(w.count(),requestsBefore);
});

test('the worker does not even create offline metadata cache before consent',async()=>{
  const w=fakeWorker();
  assert.deepEqual(w.cacheNames(),[]);
  assert.equal(await(await w.get('index.html')).text(),'HOME');
  assert.deepEqual(w.cacheNames(),[]);
});

test('an inconsistent manifest total cannot activate an offline package',async()=>{
  const w=fakeWorker(false,true);
  assert.match((await w.send('INSTALL')).at(-1).message,/TOTAL_BYTES_MISMATCH/);
  assert.equal((await w.send('STATUS')).at(-1).ready,false);
});
