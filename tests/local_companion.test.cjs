'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('web/library/local-companion.js', 'utf8');

// Exercise the adapter with synthetic local responses, then verify public origins make no requests.
(async () => {
  const calls = [];
  const ctx = {
    URL,
    File: globalThis.File,
    location: { hostname: '127.0.0.1' },
    NG_BASE: new URL('http://127.0.0.1:8777/Neo-Geo-Web/'),

    // Serve predictable status, listing, and file responses while recording requested paths.
    fetch: async url => {
      const path = new URL(url).pathname;
      calls.push(path);
      if (path.endsWith('status'))
        return {
          ok: true,
          json: async () => ({
            service: 'neogeo-local-companion',
            schema: 1,
            roles: {
              roms: { configured: true, label: 'ROMs' },
              previews: { configured: false },
              bios: { configured: true, label: 'BIOS' }
            }
          })
        };
      if (path.endsWith('list/roms'))
        return { ok: true, json: async () => ({ files: [{ name: 'kof98h.zip', size: 11 }] }) };
      if (path.endsWith('list/bios'))
        return { ok: true, json: async () => ({ files: [{ name: 'neogeo.zip', size: 7 }] }) };
      if (path.endsWith('kof98h.zip'))
        return { ok: true, blob: async () => new Blob(['content-rom']) };
      if (path.endsWith('neogeo.zip'))
        return { ok: true, blob: async () => new Blob(['content']) };
      throw Error('unexpected ' + path);
    }
  };
  ctx.globalThis = ctx;
  vm.runInNewContext(fs.readFileSync('web/languages.js', 'utf8'), ctx);
  vm.runInNewContext(source, ctx);
  const handles = await ctx.NGCompanion.connect();
  assert.equal(ctx.NGCompanion.available, true);
  assert.equal(handles.roms.kind, 'directory');
  const entries = [];
  for await (const x of handles.roms.entries()) entries.push(x);
  assert.equal(entries.length, 1);
  assert.equal(entries[0][1].sizeHint, 11);
  assert.equal((await entries[0][1].getFile()).size, 11);
  assert.equal(handles.previews, undefined);
  assert(calls.some(x => x.includes('file/roms/kof98h.zip')));
  const unsafe = {
    ...ctx,
    location: { hostname: 'example.com' },

    // Fail immediately if the public-origin adapter attempts network access.
    fetch: () => {
      throw Error('no network expected');
    }
  };
  unsafe.globalThis = unsafe;
  vm.runInNewContext(fs.readFileSync('web/languages.js', 'utf8'), unsafe);
  vm.runInNewContext(source, unsafe);
  assert.equal(await unsafe.NGCompanion.connect(), null);
  console.log('PASS local companion browser adapter; no public-origin calls');

  // Surface asynchronous assertion failures as a failing process exit.
})().catch(e => {
  console.error(e);
  process.exit(1);
});
