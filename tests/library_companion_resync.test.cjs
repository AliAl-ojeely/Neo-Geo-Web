'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
(async () => {
  let refreshes = 0; const writes = [];
  const content = Buffer.from('rom');
  const digest = crypto.createHash('sha256').update(content).digest('hex');
  const adapter = filled => ({kind:'directory',name:'ROMs',companion:true,
    async *entries() {if (filled) yield ['demo.zip',{kind:'file',name:'demo.zip',sizeHint:3,companion:true,getFile:async()=>new File([content],'demo.zip')}];}});
  const ctx = {URL,console,crypto:crypto.webcrypto,Event,File,Map,Set,Date,Promise,
    location:{origin:'http://127.0.0.1:8777'}, NG_BASE:new URL('http://127.0.0.1:8777/Neo-Geo-Web/'),
    NGCompanion:{available:true,connect:async()=>({roms:adapter(false)}),refresh:async()=>{refreshes++;return {roms:adapter(true)};}},
    NGLibraryStore:{get:async()=>null,all:async()=>[],put:async(store,key)=>{writes.push(store + ":" + key); }},
    NGFileAccess:{permission:async()=> 'granted',files:async h=>{const m=new Map();for await (const [n,f] of h.entries())m.set(n,f);return m;}},
    fetch:async()=>({json:async()=>({bios:{size:0,sha256:''},games:[{id:'demo',filename:'demo.zip',selected_filename:'demo.zip',size:3,sha256:digest}]})}),
    document:{dispatchEvent(){}}};
  ctx.parent=ctx;ctx.globalThis=ctx;
  vm.runInNewContext(fs.readFileSync('web/library/library-manager.js','utf8'),ctx);
  await ctx.NGLocal.init();
  assert.equal(ctx.NGLocal.games.length,1);
  assert.equal(refreshes,1);
  assert.equal(writes.some(x => x.startsWith("handles:") || x.startsWith("libraryProfiles:")),false);
  await ctx.NGLocal.init();
  assert.equal(refreshes,1);
  const ui=fs.readFileSync('web/library/library-ui.js','utf8');
  assert.match(ui,/querySelector\('#library-scan'\)\.onclick = \(\) => run\(\(\) => NGLocal\.restoreSaved\(\)\)/);
  console.log('PASS: stale companion list reconnected once, rescan queries fresh listings');
})().catch(e=>{console.error(e);process.exitCode=1;});
