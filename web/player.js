'use strict';

// Validate the requested game, prepare local assets, and configure the existing EmulatorJS loader.
(async function () {
  const title = document.getElementById('player-title');
  const msg = document.getElementById('player-message');
  const logBox = document.getElementById('diagnostic-log');
  const details = document.getElementById('debug-details');
  const stage = document.querySelector('.emulator-stage');
  const prefs = window.NGPrefs
    ? window.NGPrefs.load()
    : {
        language: 'en-US',
        volume: 70,
        scale: 'fit',
        pixelated: true,
        scanlines: false,
        crt: false,
        autoStart: false,
        fullscreen: false,
        askBeforeExit: false,
        diagnostics: true
      };
  const rom = new URLSearchParams(location.search).get('rom');
  let logEntries = [];

  // Keep the latest 100 bounded log entries and expand diagnostics for errors.
  const log = (level, message) => {
    const value = `${new Date().toLocaleTimeString('en-GB')} [${level}] ${String(message).slice(0, 480)}`;
    if (logEntries.length >= 100) logEntries.shift();
    logEntries.push(value);
    logBox.textContent = logEntries.join('\n');
    if (level === 'ERROR') details.open = true;
  };
  const diag = window.NGDiagnostics.create(rom, log);
  window.NGRuntimeDiagnostics = diag;

  // Display a player notice with its optional presentation class.
  const say = (message, type = '') => {
    msg.hidden = false;
    msg.textContent = message;
    msg.className = 'player-message' + (type ? ' ' + type : '');
  };

  // Refresh an existing player notice after a language change without restarting the game.
  document.addEventListener('ng-language-changed', () => {
    if (msg.hidden || !msg.textContent || !window.NGI18n?.translateText) return;
    const translated = window.NGI18n.translateText(msg.textContent);
    if (translated !== msg.textContent) msg.textContent = translated;
  });

  // Display a failure notice and add it to the diagnostic log.
  const fail = message => {
    say(message, 'error');
    log('ERROR', message);
  };

  // Copy the structured runtime report, with a visible fallback when clipboard access fails.
  document.getElementById('copy-diagnostics').addEventListener('click', async () => {
    const content = diag.export();
    try {
      await navigator.clipboard.writeText(content);
      say(NGI18n.t('player.runtime_report_copied_you_can_share_it'));
    } catch (e) {
      say(NGI18n.t('player.automatic_copying_failed_select_the_diagnostic_text'), 'warn');
    }
  });

  // Download diagnostic JSON and revoke its temporary object URL after the click.
  document.getElementById('export-diagnostics').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([diag.export()], { type: 'application/json' }));
    a.download = 'runtime-diagnostics.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  stage.classList.toggle('pixel', prefs.pixelated);
  stage.classList.toggle('scanlines', prefs.scanlines);
  stage.classList.toggle('crt', prefs.crt);
  if (prefs.scale === 'original') stage.style.maxWidth = '760px';
  if (prefs.scale === '4:3') {
    stage.style.maxWidth = '920px';
    stage.style.aspectRatio = '4 / 3';
  }
  if (prefs.diagnostics) {
    // Keep ResizeObserver loop notices nonfatal while recording other window errors.
    window.addEventListener('error', e => {
      if (e.message?.startsWith('ResizeObserver loop')) log('WARN', e.message);
      else diag.error(e.error || { message: e.message }, 'WINDOW_ERROR');
    });
    window.addEventListener('unhandledrejection', e =>
      diag.error(e.reason, 'UNHANDLED_REJECTION')
    );
    const originalWarn = console.warn.bind(console);
    const originalError = console.error.bind(console);

    // Mirror serialized warning arguments into the player log before forwarding them.
    console.warn = (...args) => {
      log('WARN', args.map(a => JSON.stringify(window.NGDiagnostics.serialize(a))).join(' '));
      originalWarn(...args);
    };

    // Mirror serialized error arguments into the player log before forwarding them.
    console.error = (...args) => {
      log('ERROR', args.map(a => JSON.stringify(window.NGDiagnostics.serialize(a))).join(' '));
      originalError(...args);
    };
  }
  if (!rom || !/^[a-zA-Z0-9_.+ -]+\.zip$/.test(rom) || rom.startsWith('.')) {
    fail(NGI18n.t('player.no_valid_game_zip_selected_return_to'));
    return;
  }
  const needed = [
    'cores/reports/fbneo.json',
    'cores/fbneo-wasm.data',
    'cores/fbneo-legacy-wasm.data'
  ];
  try {
    let data, game, launch;
    if (window.NG_STATIC) {
      const local = await NGBrowserROM.prepareWithRecovery(rom);
      game = local.game;
      data = NGLocal.data();
      launch = { driver: game.driver, rom_url: local.rom, prepared: true };
      title.setAttribute('data-no-i18n', '');
      title.textContent = game.title;
      document.title = NGI18n.t('common.gamePageTitle', { title: game.title });
      NGBrowserROM.install();
      diag.event('LOCAL_FILE_HASH_PASS', 'PASS', {
        rom: game.sha256,
        bios: local.biosSha256,
        source: game.source
      });
    } else {
      log('INFO', 'Checking local library metadata and offline core assets');
      const response = await fetch('/api/games', { cache: 'no-store' });
      if (!response.ok) throw Error('Library API HTTP ' + response.status);
      data = await response.json();
      game = data.games.find(g => g.filename === rom);
      if (!game) return fail(NGI18n.t('player.the_selected_file_is_not_in_the'));
      title.setAttribute('data-no-i18n', '');
      title.textContent = game.title;
      document.title = NGI18n.t('common.gamePageTitle', { title: game.title });
      log('INFO', `ROM ${game.filename} / ${game.size} bytes`);
      log('INFO', `Core files found ${data.engine.found}/${data.engine.total}`);
      if (!data.engine.ready)
        return fail(
          NGI18n.t('player.fbneo_files_are_incomplete_p0_p1_stop', {
            p0: data.engine.found,
            p1: data.engine.total
          })
        );
      if (!data.summary.bios_present)
        return fail(NGI18n.t('player.bios_neogeo_zip_was_not_found_in'));
      // Preflight browser-requested files; previous installer falsely passed 23/23.
      for (const item of needed) {
        const res = await fetch('/vendor/emulatorjs/data/' + item, {
          method: 'HEAD',
          cache: 'no-store'
        });
        log(res.ok ? 'OK' : 'ERROR', `core/${item} HTTP ${res.status}`);
        if (!res.ok)
          return fail(
            NGI18n.t('player.required_asset_missing') +
              ' ' +
              item +
              ' ' +
              NGI18n.t('player.run_py_3_manage_py_engine_install')
          );
      }
      launch = {
        driver: game.id,
        rom_url: '/api/rom/' + encodeURIComponent(game.filename),
        prepared: false
      };
      if (new URLSearchParams(location.search).get('compat') !== 'original') {
        const planResponse = await fetch(
          '/api/compatibility-plan?rom=' + encodeURIComponent(game.filename),
          { cache: 'no-store' }
        );
        if (!planResponse.ok)
          throw Error(
            'Compatibility plan HTTP ' +
              planResponse.status +
              ': ' +
              (await planResponse.text())
          );
        launch = await planResponse.json();
        if (launch.prepared)
          log(
            'INFO',
            'Verified local derived ROM; driver ' +
              launch.driver +
              ' SHA256 ' +
              launch.derived_sha256
          );
      }
      const romResp = await fetch(launch.rom_url, { method: 'HEAD' });
      const biosResp = await fetch('/api/bios/neogeo.zip', { method: 'HEAD' });
      log(romResp.ok ? 'OK' : 'ERROR', `ROM HTTP ${romResp.status}`);
      log(biosResp.ok ? 'OK' : 'ERROR', `BIOS HTTP ${biosResp.status}`);
      if (!romResp.ok || !biosResp.ok)
        return fail(NGI18n.t('player.cannot_read_the_game_or_bios_from'));
    }
    say(NGI18n.t('player.file_checks_complete_starting_fbneo_select_start'));
    diag.event('CORE_SELECTION', 'PASS', {
      core: 'fbneo',
      requestedLegacy: true,
      requestedThreads: false
    });

    // Resolve bundled assets relative to the static deployment base or retain server paths.
    const resource = path =>
      window.NG_STATIC ? new URL(path.replace(/^\//, ''), NG_BASE).href : path;
    for (const asset of ['fbneo-legacy-wasm.data', 'fbneo.json']) {
      // The offline worker serves cached GET requests; HEAD bypasses its cache.
      const response = await fetch(resource('/vendor/fbneo-selected-bios/' + asset), {
        method: window.NG_STATIC ? 'GET' : 'HEAD',
        cache: 'no-store'
      });
      if (!response.ok)
        throw Error('Selected-BIOS core asset missing: ' + asset + ' HTTP ' + response.status);
    }
    diag.event('PREFLIGHT_PASS', 'PASS');
    window.EJS_paths = {
      'fbneo-legacy-wasm.data': resource('/vendor/fbneo-selected-bios/fbneo-legacy-wasm.data'),
      'fbneo-wasm.data': resource('/vendor/fbneo-selected-bios/fbneo-legacy-wasm.data'),
      'fbneo.json': resource('/vendor/fbneo-selected-bios/fbneo.json')
    };
    window.EJS_player = '#game';
    window.EJS_core = 'fbneo';
    window.EJS_gameName = launch.driver;
    let h = 2166136261;
    for (const ch of game.filename) {
      h = Math.imul(h ^ ch.codePointAt(0), 16777619);
    }
    window.EJS_gameID = h >>> 0 || 1;
    window.EJS_gameUrl = launch.rom_url;
    window.EJS_biosUrl = 'neogeo.zip'; // EJS 4.2.3 uses this string as the MEMFS filename.
    window.EJS_dontExtractBIOS = true;
    window.EJS_pathtodata = resource('/vendor/emulatorjs/data/');
    if (window.NG_STATIC) window.EJS_CacheLimit = 0;
    window.EJS_language = prefs.language;
    window.EJS_disableAutoLang = true;
    window.EJS_threads = false;
    window.EJS_forceLegacyCores = true;
    window.EJS_color = '#f1b74f';
    window.EJS_backgroundColor = '#000000';
    window.EJS_volume = prefs.volume / 100;
    window.EJS_startOnLoaded = prefs.autoStart;
    window.EJS_fullscreenOnLoaded = prefs.fullscreen;
    window.EJS_askBeforeExit = prefs.askBeforeExit;

    // Attach diagnostic hooks when the frontend is ready without claiming game initialization.
    window.EJS_ready = () => {
      diag.install(window.EJS_emulator);
      diag.event('EMULATORJS_LOADER_READY', 'PASS');
      log('OK', 'EmulatorJS UI ready; core/game may still need Start or ROM validation');
      say(NGI18n.t('player.emulator_ready_select_start_to_launch_the'));
    };

    // Enable pause and input/state guards after EmulatorJS announces game startup.
    window.EJS_onGameStart = () => {
      // Update the local hero only for a successfully started game.
      if (!diag.report.failureStage) window.NGLastPlayed?.record(game?.filename);
      window.NGTabPause?.enable();
      window.NGEscExit?.enable();
      window.NGPlusFullscreen?.enable();
      if (!diag.report.failureStage)
        window.NGPerformanceMonitor?.start(window.EJS_emulator, {
          enabled: prefs.performanceMonitor,
          size: prefs.performanceHudSize,
          position: prefs.performanceHudPosition
        });
      if (window.NG_STATIC && window.parent !== window) {
        window.focus();
        window.EJS_emulator.elements.parent.focus();
      }
      window.NGInputGuard?.install(window.EJS_emulator, diag);
      window.NGStateGuard?.install(window.EJS_emulator, diag);
      log(
        'OK',
        'EmulatorJS fired onGameStart (does not verify visible frames, audio or ROM correctness)'
      );
      if (diag.report.failureStage)
        say(NGI18n.t('player.fbneo_could_not_initialize_the_game_open'), 'error');
      else msg.hidden = true;
    };

    // Disable the pause integration when EmulatorJS reports that the session ended.
    window.EJS_onExit = () => {
      window.NGTabPause?.disable();
      window.NGEscExit?.disable();
      window.NGPlusFullscreen?.disable();
      window.NGPerformanceMonitor?.stop();
      log('INFO', 'EmulatorJS exited');
    };
    const script = document.createElement('script');
    script.src = resource('/vendor/emulatorjs/data/loader.js');
    script.onload = () => log('OK', 'EmulatorJS loader script parsed');
    script.onerror = () => fail(NGI18n.t('player.could_not_load_the_local_loader_js'));
    document.body.appendChild(script);
  } catch (e) {
    diag.error(e, 'BOOTSTRAP');
    fail(
      NGI18n.t('player.could_not_initialize_the_game_or_engine') +
        ' ' +
        JSON.stringify(window.NGDiagnostics.serialize(e))
    );
  }
})();
