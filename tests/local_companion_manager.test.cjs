'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');

// Hash synthetic file contents to match the manifest checks used by the library manager.
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const game = Buffer.from('game'),
  bios = Buffer.from('bios');
const manifest = {
  bios: { size: bios.length, sha256: sha(bios) },
  games: [
    {
      filename: 'demo.zip',
      selected_filename: 'demo.zip',
      size: game.length,
      sha256: sha(game),
      driver: 'demo',
      screenshot: null
    }
  ]
};

// Create an independent browser context sharing only read counters and companion-backed handles.
const make = reads => {
  // Create a companion directory whose metadata scan does not read file contents.
  const mk = (role, n, buffer) => ({
    kind: 'directory',
    name: role,
    companion: true,

    // Yield a file-like handle carrying metadata and a deferred read counter.
    async *entries() {
      yield [
        n,
        {
          kind: 'file',
          name: n,
          sizeHint: buffer.length,
          companion: true,

          // Count actual file reads and return the synthetic file bytes.
          async getFile() {
            reads[role]++;
            return new File([buffer], n);
          }
        }
      ];
    }
  });
  const handles = { roms: mk('roms', 'demo.zip', game), bios: mk('bios', 'neogeo.zip', bios) };
  const root = {
    URL,
    console,
    crypto: crypto.webcrypto,
    Event,
    File,
    Map,
    Set,
    Date,
    Promise,
    location: { origin: 'http://127.0.0.1:8777' },
    NGCompanion: { connect: async () => handles, refresh: async () => handles },
    NG_BASE: new URL('http://127.0.0.1:8777/Neo-Geo-Web/'),
    NGLibraryStore: { get: async () => null, all: async () => [], put: async () => true },
    NGFileAccess: {
      permission: async h => (h ? 'granted' : 'missing'),

      // Index the synthetic directory handles without calling their file readers.
      files: async h => {
        let map = new Map();
        for await (const [name, file] of h.entries()) map.set(name.toLowerCase(), file);
        return map;
      }
    },
    fetch: async () => ({ json: async () => manifest }),
    document: { dispatchEvent: () => {} }
  };
  root.parent = root;
  root.globalThis = root;
  vm.runInNewContext(fs.readFileSync('web/languages.js', 'utf8'), root);
  vm.runInNewContext(fs.readFileSync('web/library/library-manager.js', 'utf8'), root);
  return root.NGLocal;
};

// Compare first-load and reopened contexts while asserting scans never download ROM contents.
(async () => {
  const reads = { roms: 0, bios: 0 };
  let first = make(reads);
  await first.init();
  assert.equal(first.games.length, 1);
  assert.equal(first.bios.status, 'VALID');
  assert.equal(reads.roms, 0, 'scanning metadata must not download ROM');
  const resolved = await first.resolve('demo.zip');
  assert.equal(resolved.source, 'local-companion');
  const second = make(reads);
  await second.init();
  assert.equal(
    second.games.length,
    1,
    'reopening browser may restore companion without persisted browser handles'
  );
  assert.equal(reads.roms, 0);
  console.log(
    'PASS companion integration: lightweight scan, per-game loading, restored after new page'
  );

  // Keep asynchronous assertion failures visible to the Node test runner.
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
