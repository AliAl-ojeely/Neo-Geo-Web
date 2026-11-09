'use strict';
const fs = require('fs'),
  vm = require('vm'),
  assert = require('node:assert/strict');
let passed = 0;

// Await one scenario before incrementing the pass count; propagate assertion failures.
async function test(label, fn) {
  await fn();
  passed++;
  console.log('PASS', label);
}

// Run permission, persistence, provider, recovery, and consent scenarios in a shared ordered fixture.
(async () => {
  const data = new Map(),
    events = [];
  const ctx = {
    console,
    URL,
    DOMException,
    File,
    Blob,
    Uint8Array,
    ArrayBuffer,
    crypto,
    Event,
    Map,
    Promise,
    document: { dispatchEvent: e => events.push(e.type) },
    addEventListener() {},
    NG_BASE: new URL('https://example.invalid/Neo-Geo-Web/'),
    NGLibraryStore: {
      get: async (s, k) => data.get(s + ':' + k),
      put: async (s, k, v) => data.set(s + ':' + k, v),
      all: async s =>
        [...data.entries()].filter(([k]) => k.startsWith(s + ':')).map(([, v]) => v),
      remove: async (s, k) => data.delete(s + ':' + k),
      forget: async () => data.clear()
    }
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('web/languages.js', 'utf8'), ctx);
  for (const name of ['filesystem-access', 'library-manager', 'rom-provider'])
    vm.runInContext(fs.readFileSync('web/library/' + name + '.js', 'utf8'), ctx);
  const L = ctx.NGLocal,
    F = ctx.NGFileAccess;
  const bytes = new Uint8Array([80, 75, 3, 4]);
  const hash = await L.hash(bytes);

  // Create a file-handle stub whose deferred reads expose the supplied bytes.
  const file = (name, content = bytes) => ({
    kind: 'file',
    name,
    getFile: async () => new File([content], name)
  });

  // Create a granted directory stub with asynchronous handle enumeration.
  const dir = (name, list) => ({
    kind: 'directory',
    name,
    queryPermission: async () => 'granted',

    // Yield the fixture handles in their supplied order.
    async *entries() {
      for (const h of list) yield [h.name, h];
    }
  });
  L.manifest = {
    bios: { size: 4, sha256: hash },
    games: [
      {
        filename: 'game.zip',
        selected_filename: 'driver.zip',
        driver: 'driver',
        size: 4,
        sha256: hash,
        dependencies: []
      }
    ]
  };
  await test('feature detection and safe names', async () => {
    assert.equal(F.supported(), false);
    assert.equal(F.validName('../rom.zip'), false);
    assert.equal(F.validName('game.zip'), true);
  });
  await test('prompt is queried without unsolicited request', async () => {
    let requests = 0;
    const h = {
      queryPermission: async () => 'prompt',

      // Count explicit permission requests separately from noninteractive permission queries.
      requestPermission: async () => {
        requests++;
        return 'granted';
      }
    };
    assert.equal(await F.permission(h), 'prompt');
    assert.equal(requests, 0);
    assert.equal(await F.permission(h, true), 'granted');
    assert.equal(requests, 1);
  });
  await test('denied does not request again', async () => {
    const h = {
      queryPermission: async () => 'denied',
      requestPermission: () => {
        throw Error('should not run');
      }
    };
    assert.equal(await F.permission(h, true), 'denied');
  });
  await test('restore missing DB and corrupt metadata safely', async () => {
    data.set('metadata:index', { schema: 'corrupt', games: null });
    await L.restore();
    assert.equal(L.games.length, 0);
    assert.equal(L.states.roms, 'missing');
  });
  const romDir = dir('ROMs', [file('driver.zip')]),
    previews = dir('PREVIEWS', []),
    bios = file('neogeo.zip');
  await test('save handles and restore independently', async () => {
    await L.acceptHandle('roms', romDir);
    await L.acceptHandle('previews', previews);
    await L.acceptHandle('bios', bios);
    await L.save();
    L.handles = {};
    await L.restore();
    assert.equal(L.games.length, 1);
    assert.equal(L.bios.status, 'VALID');
    assert.equal(L.handles.previews, previews);
  });
  await test('deleted ROM directory preserves previews and BIOS', async () => {
    L.handles.roms = {
      ...romDir,

      // Simulate a deleted directory through the browser-style NotFoundError path.
      async *entries() {
        throw new DOMException('removed', 'NotFoundError');
      }
    };
    await L.scan();
    assert.equal(L.states.roms, 'missing');
    assert.equal(L.handles.previews, previews);
    assert.equal(L.bios.status, 'VALID');
    L.handles.roms = romDir;
  });
  await test('outer BIOS package rejected', async () => {
    L.handles.bios = file('NeoGeo_BIOS_Package.zip');
    await L.scan();
    assert.equal(L.bios, null);
    assert.equal(L.states.bios, 'invalid');
    L.handles.bios = bios;
    await L.scan();
  });
  await test('File provider exact bytes and virtual driver filename', async () => {
    L.ready = Promise.resolve();
    const r = await ctx.NGBrowserROM.prepare('game.zip');
    assert.equal(r.rom.name, 'driver.zip');
    assert.equal(await L.hash(await r.rom.arrayBuffer()), hash);
    ctx.NGBrowserROM.release();
    assert.equal(ctx.NGBrowserROM.active, null);
  });
  await test('same-sized ROM mutation rejected by SHA', async () => {
    L.maps.roms.set('driver.zip', file('driver.zip', new Uint8Array([1, 2, 3, 4])));
    await assert.rejects(() => ctx.NGBrowserROM.prepare('game.zip'), /ROM_HASH_MISMATCH/);
  });

  await test('selected Driver filename resolves to stable original identity', async () => {
    await L.scan();
    const g = await L.resolve('driver.zip');
    assert.equal(g.filename, 'game.zip');
    assert.equal(g.driver, 'driver');
  });
  await test('missing ROM and wrong size produce different errors', async () => {
    const h = L.maps.roms.get('driver.zip');
    L.maps.roms.delete('driver.zip');
    await assert.rejects(
      () => L.resolve('game.zip'),
      e => e.code === 'ROM_FILE_NOT_FOUND'
    );
    L.maps.roms.set('driver.zip', file('driver.zip', new Uint8Array(8)));
    await assert.rejects(
      () => L.resolve('game.zip'),
      e => e.code === 'ROM_SIZE_MISMATCH' && e.details.expectedSize === 4
    );
    L.maps.roms.set('driver.zip', h);
  });
  await test('prompt and absent directory remain recoverable', async () => {
    L.states.roms = 'prompt';
    await assert.rejects(
      () => L.resolve('game.zip'),
      e => e.code === 'ROM_DIRECTORY_PERMISSION_REQUIRED'
    );
    L.states.roms = 'missing';
    await assert.rejects(
      () => L.resolve('game.zip'),
      e => e.code === 'ROM_DIRECTORY_NOT_CONNECTED'
    );
    await L.scan();
  });
  await test('requestPermission starts synchronously in reconnect click stack', async () => {
    let called = false;
    const previous = L.handles.roms;
    L.handles.roms = {
      ...romDir,

      // Expose synchronous invocation before the returned permission promise settles.
      requestPermission: () => {
        called = true;
        return Promise.resolve('granted');
      }
    };
    const pending = L.reconnect('roms');
    assert.equal(called, true);
    await pending;
    L.handles.roms = previous;
  });
  await test('BIOS prompt has a specific recovery code', async () => {
    const previous = L.bios;
    L.bios = null;
    L.states.bios = 'prompt';
    await assert.rejects(
      () => ctx.NGBrowserROM.prepare('game.zip'),
      e => e.code === 'BIOS_PERMISSION_REQUIRED'
    );
    L.bios = previous;
    L.states.bios = 'granted';
  });
  await test('fallback expiry is explicit and does not remove saved native handles', async () => {
    const previous = L.handles.roms;
    const fallback = { ...romDir, fallback: true };
    await L.acceptHandle('roms', fallback);
    await L.save();
    assert.equal(data.get('handles:roms'), previous);
    L.handles = {};
    await L.restore();
    await assert.rejects(
      () => L.resolve('game.zip'),
      e => e.code === 'FALLBACK_SESSION_ONLY'
    );
    await L.acceptHandle('roms', previous);
    await L.save();
  });
  await test('optional per-game copy requires consent and survives without handles', async () => {
    const local = await ctx.NGBrowserROM.prepare('game.zip');
    await assert.rejects(
      () => L.keepGame(local),
      e => e.code === 'LOCAL_COPY_CONSENT_REQUIRED'
    );
    await L.keepGame(local, { consent: true });
    assert.equal((await ctx.NGLibraryStore.all('localCopies')).length, 1);
    L.handles = {};
    await L.scan();
    const restored = await ctx.NGBrowserROM.prepare('game.zip');
    assert.equal(restored.game.source, 'browser-copy');
    assert.equal(await L.hash(await restored.rom.arrayBuffer()), hash);
    await ctx.NGLibraryStore.remove('localCopies', 'game.zip');
    await L.restore();
  });
  await test('BIOS folder fallback retains directory semantics and locates inner ZIP', async () => {
    const h = F.fromFiles(
      'bios',
      [new File([new Uint8Array([1])], 'unrelated.zip'), new File([bytes], 'neogeo.zip')],
      'BIOS',
      true
    );
    assert.equal(h.kind, 'directory');
    const index = await F.files(h);
    assert.equal((await index.get('neogeo.zip').getFile()).size, 4);
  });
  await test('storage failure remains visible', async () => {
    const old = ctx.NGLibraryStore.put;

    // Inject a quota failure so the existing error visibility assertion exercises persistence failure.
    ctx.NGLibraryStore.put = async () => {
      throw Error('quota');
    };
    await L.scan();
    assert.ok(L.errors.some(e => e.includes('quota')));
    ctx.NGLibraryStore.put = old;
  });
  await test('Forget touches only library database', async () => {
    await L.forget();
    assert.equal(data.size, 0);
    assert.equal(L.games.length, 0);
    assert.equal(events.includes('ng-library-changed'), true);
  });
  console.log(`${passed} local library tests PASS`);

  // Report an asynchronous scenario failure and preserve a nonzero process exit.
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
