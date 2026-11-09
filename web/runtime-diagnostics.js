'use strict';
(function (global) {
  // Serialize error properties with depth and cycle limits, recording getters that throw.
  function serialize(value, seen = new WeakSet(), depth = 0) {
    if (value === null) return null;
    if (value === undefined) return { type: 'undefined' };
    if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
    if (['string', 'boolean'].includes(typeof value)) return value;
    if (typeof value === 'bigint' || typeof value === 'symbol' || typeof value === 'function')
      return String(value);
    if (depth > 12) return '[Depth limit]';
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    const result = Object.create(null);
    let keys = ['name', 'message', 'stack', 'cause', 'code', 'errno'];
    try {
      keys = [...new Set([...keys, ...Object.getOwnPropertyNames(value)])];
    } catch (e) {
      result.propertiesError = String(e);
    }
    for (const key of keys) {
      try {
        if (key in value) result[key] = serialize(value[key], seen, depth + 1);
      } catch (e) {
        result[key] = { getterError: String(e) };
      }
    }
    return result;
  }

  // Create a bounded event report and runtime hooks for one requested ROM.
  function create(rom, log) {
    const stages = [
      'BOOTSTRAP_START',
      'PREFLIGHT_PASS',
      'EMULATORJS_LOADER_READY',
      'CORE_SELECTION',
      'CORE_INIT_START',
      'CORE_INIT_PASS',
      'BIOS_FETCH_START',
      'BIOS_FETCH_PASS',
      'BIOS_ARCHIVE_PROCESSED',
      'BIOS_FS_MOUNT_PASS',
      'ROM_FETCH_START',
      'ROM_FETCH_PASS',
      'ROM_DRIVER_MATCH',
      'GAME_INIT_START',
      'GAME_INIT_PASS',
      'FIRST_FRAME',
      'AUDIO_READY',
      'INPUT_READY',
      'GAME_RUNNING'
    ];
    const report = {
      projectVersion: '0.1.5.1',
      browser: navigator.userAgent,
      rom,
      core: 'fbneo',
      biosVariant: 'NOT VERIFIED',
      selectedEngineAssets: [],
      stages: Object.fromEntries(stages.map(s => [s, 'NOT VERIFIED'])),
      events: [],
      errors: [],
      network: [],
      hashes: {},
      lastSuccessfulStage: null,
      failureStage: null
    };

    // Record a stage observation, update report markers, and forward a serialized log entry.
    function event(stage, status = 'OBSERVED', detail = {}) {
      report.events.push({
        timestamp: new Date().toISOString(),
        runtimeMs: performance.now(),
        stage,
        status,
        detail: serialize(detail)
      });
      if (report.events.length > 1500) report.events.shift();
      report.stages[stage] = status;
      if (status === 'PASS') report.lastSuccessfulStage = stage;
      report.currentStage = stage;
      if (stage === 'CORE_SELECTION') report.coreSelection = detail;
      if (status === 'FAIL' && !report.failureStage) report.failureStage = stage;
      log(
        status === 'FAIL' ? 'ERROR' : 'TRACE',
        stage + ' ' + status + ' ' + JSON.stringify(serialize(detail))
      );
    }

    // Capture error details and mark the first failed stage through the event recorder.
    function error(value, stage = 'JAVASCRIPT', asset) {
      report.errorDetails = serialize(value);
      report.errors.push({
        timestamp: new Date().toISOString(),
        stage,
        runtimeStage: report.currentStage,
        relatedAsset: asset,
        error: report.errorDetails
      });
      event(stage, 'FAIL', { error: report.errorDetails, relatedAsset: asset });
    }

    // Hash a byte copy with SHA-256 and store its hexadecimal digest under the report key.
    async function hash(bytes, key) {
      const copy = new Uint8Array(bytes);
      report.hashes[key] = Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', copy)),
        x => x.toString(16).padStart(2, '0')
      ).join('');
      return report.hashes[key];
    }

    // Wrap emulator and filesystem boundaries to observe actual loading and initialization outcomes.
    function install(emu) {
      const cache = emu.storage?.core;
      if (cache && typeof cache.get === 'function') {
        const get = cache.get.bind(cache);

        // Record actual FBNeo cache lookups before forwarding the original request.
        cache.get = async function (filename) {
          if (/fbneo.*-wasm\.data$/.test(filename)) {
            report.selectedEngineAssets = [
              ...new Set([...report.selectedEngineAssets, 'cores/' + filename])
            ];
            report.coreSelection = {
              core: emu.getCore(),
              asset: filename,
              legacy: filename.includes('-legacy-'),
              source: 'actual core cache lookup'
            };
          }
          return get(filename);
        };
      }
      const download = emu.downloadFile;

      // Record network outcomes and hash downloaded Neo Geo BIOS data without changing the payload.
      emu.downloadFile = async function (path, progress, notWithPath, opts = {}) {
        const asset = typeof path === 'string' ? path : path?.name || 'File';
        const item = { asset, method: opts.method || 'GET', started: new Date().toISOString() };
        report.network.push(item);
        if (typeof path === 'string' && path.includes('fbneo-') && path.endsWith('.data'))
          report.selectedEngineAssets = [...new Set([...report.selectedEngineAssets, path])];
        try {
          const out = await download.call(this, path, progress, notWithPath, opts);
          item.result = out === -1 ? 'FAIL' : 'PASS';
          item.bytes = out?.data?.byteLength;
          if (out?.data && /neogeo/.test(asset))
            await hash(new Uint8Array(out.data), 'bios_network');
          return out;
        } catch (e) {
          item.result = 'FAIL';
          error(e, 'NETWORK', asset);
          throw e;
        }
      };
      const init = emu.initModule;

      // Temporarily wrap the runtime factory to observe core output and initialization results.
      emu.initModule = function (...args) {
        event('CORE_INIT_START', 'OBSERVED');
        const factory = window.EJS_Runtime;

        // Attach output probes to the factory options and preserve module fulfillment or rejection.
        window.EJS_Runtime = function (opts) {
          for (const key of ['print', 'printErr']) {
            const old = opts[key];

            // Interpret known core messages for diagnostics before forwarding the original output callback.
            opts[key] = function (text) {
              event('CORE_OUTPUT', 'OBSERVED', { channel: key, text });
              if (/Using ROM with known crc .*230-p1/.test(text))
                event('ROM_DRIVER_MATCH', 'PASS', { text });
              if (/Found this bios for requested mode/.test(text)) {
                report.biosVariant = text;
                event('BIOS_SELECTION', 'PASS', { text });
              }
              if (/No missing files, proceeding/i.test(text))
                event('ROM_VALIDATION', 'PASS', { text });
              else if (/is required|can't load|failed to load/i.test(text))
                event('ROM_VALIDATION', 'FAIL', { text });
              old?.(text);
            };
          }
          return factory(opts).then(
            module => {
              event('CORE_INIT_PASS', 'PASS');
              return module;
            },
            e => {
              error(e, 'CORE_INIT_START');
              throw e;
            }
          );
        };
        try {
          return init.apply(this, args);
        } finally {
          window.EJS_Runtime = factory;
        }
      };
      const downloads = emu.downloadFiles;

      // Inspect filesystem capabilities and install file-write/open probes before asset loading.
      emu.downloadFiles = function (...args) {
        const fs = this.Module.FS;
        report.filesystem = {
          type: fs.root?.mount?.type === fs.filesystems?.MEMFS ? 'MEMFS' : 'UNKNOWN',
          apis: ['readdir', 'stat', 'readFile', 'writeFile', 'mkdirTree'].filter(
            k => typeof fs[k] === 'function'
          )
        };
        const write = fs.writeFile;

        // Read back relevant writes for size and hash evidence; preserve filesystem exceptions.
        fs.writeFile = function (path, bytes, ...rest) {
          const bios = String(path).endsWith('neogeo.zip');
          const romFile = String(path).endsWith(rom);
          try {
            const out = write.call(this, path, bytes, ...rest);
            if (bios || romFile) {
              const read = this.readFile(path);
              event(bios ? 'BIOS_FS_MOUNT_PASS' : 'ROM_FS_WRITE_PASS', 'PASS', {
                path,
                bytes: read.length,
                readable: true
              });
              hash(read, bios ? 'bios_memfs' : 'rom_memfs').catch(e => error(e, 'HASH'));
            }
            return out;
          } catch (e) {
            error(e, bios ? 'BIOS_FS_WRITE' : 'FS_WRITE', path);
            throw e;
          }
        };
        const open = fs.open;

        // Record ROM and BIOS open attempts without swallowing failures.
        fs.open = function (path, ...rest) {
          const relevant =
            typeof path === 'string' && (/neogeo\.zip$/.test(path) || path.endsWith(rom));
          try {
            const result = open.call(this, path, ...rest);
            if (relevant) event('FS_OPEN', 'PASS', { path, flags: rest[0] });
            return result;
          } catch (e) {
            if (relevant)
              event('FS_OPEN', 'OBSERVED', { path, outcome: 'FAIL', error: serialize(e) });
            throw e;
          }
        };
        return downloads.apply(this, args);
      };
      for (const [method, start, pass] of [
        ['downloadRom', 'ROM_FETCH_START', 'ROM_FETCH_PASS'],
        ['downloadBios', 'BIOS_FETCH_START', 'BIOS_FETCH_PASS']
      ]) {
        const fn = emu[method];

        // Mark a fetch successful only when the matching filesystem write was observed.
        emu[method] = async function (...args) {
          event(start, 'OBSERVED');
          try {
            const out = await fn.apply(this, args);
            const mounted =
              report.stages[
                method === 'downloadBios' ? 'BIOS_FS_MOUNT_PASS' : 'ROM_FS_WRITE_PASS'
              ] === 'PASS';
            event(pass, mounted ? 'PASS' : 'NOT VERIFIED');
            if (method === 'downloadBios' && mounted)
              event('BIOS_ARCHIVE_PROCESSED', 'PASS', {
                mode: 'ZIP retained without extraction'
              });
            return out;
          } catch (e) {
            error(e, start);
            throw e;
          }
        };
      }
      const start = emu.startGame;

      // Enable verbose core startup temporarily and record frontend return without claiming gameplay.
      emu.startGame = function (...args) {
        event('GAME_INIT_START', 'OBSERVED');
        const main = this.Module.callMain;
        const module = this.Module;

        // Prepend verbose logging to the native argument list during this startup call.
        module.callMain = function (argv) {
          return main.call(module, ['-v', ...argv]);
        };
        let out;
        try {
          out = start.apply(this, args);
        } finally {
          module.callMain = main;
        }
        report.coreOptions = this.gameManager?.getCoreOptions();
        event('FRONTEND_START_RETURNED', 'OBSERVED', {
          note: 'May render FBNeo error screen; gameplay not verified'
        });
        return out;
      };
    }
    // Capture runs before loader.js's script.onload resolves and constructs EmulatorJS.
    const offlineHook = e => {
      if (
        e.target?.tagName !== 'SCRIPT' ||
        !/(?:emulator\.min|emulator)\.js(?:$|\?)/.test(e.target.src)
      )
        return;
      if (
        typeof EmulatorJS !== 'undefined' &&
        typeof EmulatorJS.prototype.checkForUpdates === 'function'
      ) {
        // Record the disabled online update check while retaining the pinned local core assets.
        EmulatorJS.prototype.checkForUpdates = function () {
          event('UPDATE_CHECK_SKIPPED', 'OBSERVED', {
            reason: 'offline local installation; no core assets changed'
          });
        };
        document.removeEventListener('load', offlineHook, true);
      }
    };
    if (typeof document !== 'undefined') document.addEventListener('load', offlineHook, true);
    event('BOOTSTRAP_START', 'OBSERVED');
    return {
      report,
      event,
      error,
      hash,
      install,

      // Serialize report metadata and observations without embedding ROM or BIOS bytes.
      export: () => JSON.stringify(report, null, 2)
    };
  }
  global.NGDiagnostics = { serialize, create };
  if (typeof module !== 'undefined') module.exports = { serialize };
})(globalThis);
