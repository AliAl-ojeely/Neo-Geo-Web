'use strict';
(function (root) {
  let active = null;

  /**
   * Resolves the selected ROM, validates ROM/BIOS sizes and hashes, and checks dependencies.
   * Returns a prepared bundle whose File name is the driver archive name; publishes it as active.
   */
  async function prepare(filename) {
    const g = await NGLocal.resolve(filename);
    const biosHandle = g.biosHandle || NGLocal.bios?.handle;
    if (!biosHandle) {
      const state = NGLocal.states.bios;
      throw NGLocal.error(
        ['prompt', 'denied'].includes(state)
          ? 'BIOS_PERMISSION_REQUIRED'
          : state === 'invalid'
            ? 'BIOS_INVALID'
            : 'BIOS_NOT_CONNECTED',
        { state, expected: 'neogeo.zip' }
      );
    }
    let file, data;
    try {
      file = await g.handle.getFile();
      if (file.size !== g.size)
        throw NGLocal.error('ROM_SIZE_MISMATCH', {
          expected: g.selected_filename,
          expectedSize: g.size,
          actualSize: file.size
        });
      data = await file.arrayBuffer();
    } catch (e) {
      if (e.code && typeof e.code === 'string') throw e;
      throw NGLocal.error(
        e.name === 'NotAllowedError'
          ? 'ROM_DIRECTORY_PERMISSION_REQUIRED'
          : 'ROM_FILE_NOT_FOUND',
        { expected: g.selected_filename }
      );
    }
    const sha = await NGLocal.hash(data);
    if (sha !== g.sha256)
      throw NGLocal.error('ROM_HASH_MISMATCH', {
        expected: g.selected_filename,
        driver: g.driver,
        expectedSha256: g.sha256,
        actualSha256: sha
      });
    let bios;
    try {
      bios = await biosHandle.getFile();
    } catch (e) {
      throw NGLocal.error(
        e.name === 'NotAllowedError' ? 'BIOS_PERMISSION_REQUIRED' : 'BIOS_NOT_CONNECTED',
        { expected: 'neogeo.zip' }
      );
    }
    const biosData = await bios.arrayBuffer();
    if ((await NGLocal.hash(biosData)) !== NGLocal.manifest.bios.sha256)
      throw NGLocal.error('BIOS_INVALID', { expected: 'neogeo.zip' });
    for (const dep of g.dependencies || [])
      if (!NGLocal.maps.roms.has(dep.toLowerCase()))
        throw Error(NGI18n.t('rom_provider.missing_dependency') + ' ' + dep);
    active = {
      game: g,
      rom: new File([data], g.driver + '.zip', { type: 'application/zip' }),
      bios: new Uint8Array(biosData),
      sha256: sha,
      biosSha256: NGLocal.manifest.bios.sha256
    };
    return active;
  }

  // Retries only recognized local-source failures after the recovery UI resolves its pending retry.
  async function prepareWithRecovery(filename) {
    for (;;) {
      try {
        const local = await prepare(filename);
        root.NGPlayerRecovery?.copyControls(local);
        return local;
      } catch (error) {
        if (
          !root.NGPlayerRecovery ||
          ![
            'ROM_DIRECTORY_PERMISSION_REQUIRED',
            'ROM_DIRECTORY_NOT_CONNECTED',
            'ROM_FILE_NOT_FOUND',
            'ROM_SIZE_MISMATCH',
            'ROM_HASH_MISMATCH',
            'BIOS_PERMISSION_REQUIRED',
            'BIOS_INVALID',
            'BIOS_NOT_CONNECTED',
            'FALLBACK_SESSION_ONLY'
          ].includes(error.code)
        )
          throw error;
        await root.NGPlayerRecovery.wait(error, filename);
      }
    }
  }
  // EJS 4.2.3 already reads File through toData() and assigns File.name before
  // getBaseFileName(true). Only BIOS needs a fixed MEMFS filename adapter.

  // Registers a one-shot loader hook before EmulatorJS constructs the runtime.
  function install() {
    document.addEventListener(
      'load',

      // Patches the loaded EmulatorJS prototype, then removes this capturing script-load listener.
      function hook(event) {
        if (
          event.target?.tagName !== 'SCRIPT' ||
          !/(?:emulator\.min|emulator)\.js(?:$|\?)/.test(event.target.src) ||
          typeof EmulatorJS === 'undefined'
        )
          return;
        const proto = EmulatorJS.prototype;

        // Mounts BIOS at its fixed MEMFS path and verifies both mounted archives before recording success.
        proto.downloadBios = async function () {
          if (!active) throw Error('Local BIOS provider released');
          const fs = this.gameManager.FS;
          fs.writeFile('/neogeo.zip', active.bios);
          const mounted = fs.readFile('/neogeo.zip');
          const hash = await NGLocal.hash(mounted);
          if (hash !== active.biosSha256) throw Error('BIOS_MEMFS_HASH_MISMATCH');
          const romBytes = fs.readFile('/' + this.fileName),
            romHash = await NGLocal.hash(romBytes);
          if (romHash !== active.sha256) throw Error('ROM_MEMFS_HASH_MISMATCH');
          root.NGLocalRuntime = {
            rom: active.game.selected_filename,
            driver: active.game.driver,
            rom_sha256: active.sha256,
            rom_memfs_sha256: romHash,
            rom_memfs_bytes: romBytes.length,
            bios_path: '/neogeo.zip',
            bios_bytes: mounted.length,
            bios_sha256: hash
          };
          this.config.biosUrl = 'neogeo.zip';
          root.NGRuntimeDiagnostics?.event('BIOS_FS_MOUNT_PASS', 'PASS', root.NGLocalRuntime);
        };
        // EJS has an optional CDN version probe; all runtime assets remain local.
        proto.checkForUpdates = function () {};
        document.removeEventListener('load', hook, true);
      },
      true
    );
  }
  root.NGBrowserROM = {
    prepare,
    prepareWithRecovery,
    install,

    // Drops the provider's active bundle reference without clearing saved browser data.
    release() {
      active = null;
    },

    // Exposes the currently prepared bundle by reference for the runtime and diagnostics.
    get active() {
      return active;
    }
  };
  addEventListener('pagehide', () => root.NGBrowserROM.release());
})(globalThis);
