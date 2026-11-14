'use strict';
(() => {
  // Resolve settings-page elements by ID.
  const $ = id => document.getElementById(id);
  const { DEFAULTS, load, save, sanitize } = window.NGPrefs;
  let prefs = load();
  let current = 'controls';
  let summary = null;

  // UI language is saved independently; staged emulator preferences are left intact.
  const languageSelect = $('ui-language');
  languageSelect.value = NGI18n.getLanguage();
  languageSelect.addEventListener('change', () => {
    const saved = NGI18n.setLanguage(languageSelect.value);
    $('ui-language-status').textContent = NGI18n.t(
      saved ? 'common.languageSaved' : 'common.storageMemoryOnly'
    );
  });

  const headings = {
    controls: [
      NGI18n.t('settings.controls_and_keys'),
      NGI18n.t('settings.configure_keyboard_bindings_and_check_connected_controllers')
    ],
    directories: [
      NGI18n.t('settings.directories_and_sources'),
      NGI18n.t('settings.manage_local_roms_previews_and_bios_references')
    ],
    video: [
      NGI18n.t('settings.video_and_graphics'),
      NGI18n.t('settings.adjust_aspect_ratio_pixel_edges_and_display')
    ],
    audio: [
      NGI18n.t('settings.audio_system'),
      NGI18n.t('settings.set_the_default_startup_volume')
    ],
    machine: [
      NGI18n.t('settings.system'),
      NGI18n.t('settings.emulator_interface_language_and_system_preferences')
    ],
    misc: [
      NGI18n.t('settings.more_options'),
      NGI18n.t('settings.automatic_startup_fullscreen_exit_confirmation_and_diagnostics')
    ]
  };

  // Escape dynamic path text before inserting it into settings HTML.
  const safe = s =>
    String(s ?? '').replace(
      /[&<>"']/g,
      c =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        })[c]
    );

  // Render a settings card with optional disabled and full-width presentation.
  function card(title, desc, inner, live = true, wide = false) {
    return `<article class="setting-card${live ? '' : ' disabled'}${wide ? ' wide' : ''}">
      <h3>${title}</h3>
      <p>${desc}</p>
      <div class="setting-control-body">${inner}</div>
    </article>`;
  }

  // Render preference choices; reuse the display-language dropdown design for EmulatorJS.
  function option(key, values) {
    const isEmulatorLanguage = key === 'language';
    const select = `<select${isEmulatorLanguage ? ' class="ui-language-select"' : ''} data-pref="${key}" aria-label="${NGI18n.t(key === 'scale' ? 'settings.game_area_and_aspect_ratio' : 'settings.emulator_menu_language')}">${values
      .map(
        ([v, label]) =>
          `<option value="${v}"${prefs[key] === v ? ' selected' : ''}>${label}</option>`
      )
      .join('')}</select>`;

    if (!isEmulatorLanguage) return select;

    return `<div class="ui-language-select-shell">${select}<svg class="ui-language-chevron" aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg></div>`;
  }

  // Render a preference checkbox reflecting the current in-memory value.
  function toggle(key, label) {
    return `<label class="setting-toggle-label"><input type="checkbox" data-pref="${key}"${prefs[key] ? ' checked' : ''}> <span>${label}</span></label>`;
  }


  // Build a localized HUD preference select; existing data-pref save handling persists it.
  function hudSelect(key, labelKey, values) {
    const label = NGI18n.t(labelKey);
    return `<label class="ng-performance-setting-choice"><span>${label}</span><select data-pref="${key}" aria-label="${label}">${values.map(([value, textKey]) =>
      `<option value="${value}"${prefs[key] === value ? ' selected' : ''}>${NGI18n.t(textKey)}</option>`
    ).join('')}</select></label>`;
  }

  // Show an escaped server path or the loading placeholder.
  function path(key) {
    return `<div class="setting-path">${safe(summary?.[key] || NGI18n.t('settings.reading_path'))}</div>`;
  }

  const cards = {
    // Render the global keyboard editor and a browser gamepad probe.
    controls: () => [
      card(
        NGI18n.t('settings.global_controls_neo_geo_custom'),
        NGI18n.t('settings.set_both_players_keys_once_new_sessions'),
        '<div id="global-controls-root"></div>',
        true,
        true
      ),
      card(
        NGI18n.t('settings.controller_check_gamepad'),
        NGI18n.t('settings.check_connected_controllers_before_configuring_them_in'),
        `<div class="gamepad-test-row"><button id="test-gamepad" class="settings-utility" type="button">${NGI18n.t('settings.check_controllers')}</button><div id="gamepad-result" class="gamepad-status-box"></div></div>`,
        true,
        true
      )
    ],

    // Show the static library manager link or read-only server directory paths.
    directories: () =>
      window.NG_STATIC
        ? [
            card(
              NGI18n.t('settings.local_library_roms_previews_bios'),
              NGI18n.t('settings.the_browser_stores_read_only_references_without'),
              `<a class="back-home inline-action-link" href="./#local-library">${NGI18n.t('settings.open_local_library_manager')}</a>`,
              true,
              true
            )
          ]
        : [
            card(
              NGI18n.t('settings.game_directory_roms'),
              NGI18n.t('settings.the_server_reads_zips_in_place_without'),
              path('roms'),
              true,
              true
            ),
            card(
              NGI18n.t('settings.preview_directory_previews'),
              NGI18n.t('settings.190_bmp_previews_linked_to_original_neoragex'),
              path('screenshots'),
              true,
              true
            )
          ],

    // Render display preferences from the current in-memory settings.
    video: () => [
      card(
        NGI18n.t('settings.game_area_and_aspect_ratio'),
        NGI18n.t('settings.choose_how_the_game_fits_your_browser'),
        option('scale', [
          ['fit', NGI18n.t('settings.fit_window')],
          ['4:3', NGI18n.t('settings.classic_arcade_4_3')],
          ['original', NGI18n.t('settings.compact_original_size')]
        ]),
        true
      ),
      card(
        NGI18n.t('settings.sharp_pixels'),
        NGI18n.t('settings.keep_pixel_art_crisp_instead_of_applying'),
        toggle('pixelated', NGI18n.t('settings.enable_sharp_pixels')),
        true
      ),
      card(
        NGI18n.t('settings.scanlines'),
        NGI18n.t('settings.add_arcade_style_scanlines_over_the_game'),
        toggle('scanlines', NGI18n.t('settings.show_scanlines')),
        true
      ),
      card(
        NGI18n.t('settings.arcade_contrast_crt'),
        NGI18n.t('settings.adjust_contrast_and_color_saturation_for_an'),
        toggle('crt', NGI18n.t('settings.enable_crt_effect')),
        true
      )
    ],

    // Render the initial-volume slider and its percentage display.
    audio: () => [
      card(
        NGI18n.t('settings.master_volume'),
        NGI18n.t('settings.set_the_initial_game_volume'),
        `<div class="range-row"><input type="range" data-pref="volume" min="0" max="100" value="${prefs.volume}" aria-label="${NGI18n.t('settings.volume')}"><strong id="volume-output">${prefs.volume}%</strong></div>`,
        true,
        true
      )
    ],

    // Render the supported EmulatorJS interface language choices.
    machine: () => [
      card(
        NGI18n.t('settings.emulator_menu_language'),
        NGI18n.t('settings.language_of_emulatorjs_menus_inside_the_player'),
        option('language', [
          ['ar-AR', NGI18n.t('settings.arabic_ar_ar')],
          ['en-US', 'English (en-US)']
        ]),
        true
      )
    ],

    // Render startup, exit confirmation, and diagnostic preferences.
    misc: () => [
      // Library paging is independent of the existing entrance animations.
      card(
        NGI18n.t('offline.title'),
        NGI18n.t('offline.description'),
        `<div class="ng-offline-actions"><button id="ng-offline-action" class="settings-utility ng-offline-button" type="button">${NGI18n.t('offline.button')}</button><button id="ng-offline-remove" class="settings-utility ng-offline-remove" type="button" hidden>${NGI18n.t('offline.remove_button')}</button></div><p class="ng-offline-detail" data-i18n-text="offline.remove_scope">${NGI18n.t('offline.remove_scope')}</p><p id="ng-offline-status" class="ng-offline-status" role="status">${NGI18n.t('offline.not_installed')}</p><p class="ng-offline-extension-note" data-i18n-text="offline.extension_note" role="note">${NGI18n.t('offline.extension_note')}</p><section class="ng-offline-storage-box" aria-label="${NGI18n.t('offline.storage_heading')}"><strong data-i18n-text="offline.storage_heading">${NGI18n.t('offline.storage_heading')}</strong><p data-i18n-text="offline.storage_location">${NGI18n.t('offline.storage_location')}</p><p><span data-i18n-text="offline.storage_site">${NGI18n.t('offline.storage_site')}</span> <span id="ng-offline-storage-site" class="ng-offline-storage-site" dir="ltr" data-no-i18n></span></p><p data-i18n-text="offline.storage_scope">${NGI18n.t('offline.storage_scope')}</p><p data-i18n-text="offline.storage_inspect">${NGI18n.t('offline.storage_inspect')}</p><p data-i18n-text="offline.storage_privacy">${NGI18n.t('offline.storage_privacy')}</p></section><progress id="ng-offline-progress" class="ng-offline-progress" max="100" value="0" hidden></progress><p id="ng-offline-detail" class="ng-offline-detail" role="status"></p>`,
        true,
        true
      ),
      card(
        NGI18n.t('settings.automatic_startup'),
        NGI18n.t('settings.start_after_file_checks_your_browser_may'),
        toggle('autoStart', NGI18n.t('settings.start_when_ready')),
        true
      ),
      card(
        NGI18n.t('settings.fullscreen_on_startup'),
        NGI18n.t('settings.request_fullscreen_when_the_game_starts'),
        toggle('fullscreen', NGI18n.t('settings.start_in_fullscreen')),
        true
      ),
      card(
        NGI18n.t('settings.confirm_exit'),
        NGI18n.t('settings.ask_before_closing_the_emulator'),
        toggle('askBeforeExit', NGI18n.t('settings.ask_before_exiting')),
        true
      ),
      card(
        NGI18n.t('settings.runtime_diagnostics'),
        NGI18n.t('settings.record_loading_stages_and_sha_256_checks'),
        toggle('diagnostics', NGI18n.t('settings.enable_runtime_diagnostics')),
        true
      ),
      card(
        NGI18n.t('performance_monitor.settings_title'),
        NGI18n.t('performance_monitor.settings_description'),
        toggle('performanceMonitor', NGI18n.t('performance_monitor.settings_toggle')) +
        `<div class="ng-performance-settings-grid">` +
        hudSelect('performanceHudSize', 'performance_monitor.hud_size_label', [
          ['full', 'performance_monitor.hud_full'],
          ['medium', 'performance_monitor.hud_medium'],
          ['small', 'performance_monitor.hud_small']
        ]) +
        hudSelect('performanceHudPosition', 'performance_monitor.hud_position_label', [
          ['top-left', 'performance_monitor.hud_top_left'],
          ['top-center', 'performance_monitor.hud_top_center'],
          ['top-right', 'performance_monitor.hud_top_right'],
          ['middle-left', 'performance_monitor.hud_middle_left'],
          ['middle-right', 'performance_monitor.hud_middle_right'],
          ['bottom-left', 'performance_monitor.hud_bottom_left'],
          ['bottom-center', 'performance_monitor.hud_bottom_center'],
          ['bottom-right', 'performance_monitor.hud_bottom_right']
        ]) + `</div>`,
        true
      ),
      // Keep paging as the final More options card, separate from animation preferences.
      card(
        NGI18n.t('settings.library_load_more_title'),
        NGI18n.t('settings.library_load_more_description'),
        toggle('loadMoreGames', NGI18n.t('settings.library_load_more_enable')),
        true
      )
    ]
  };

  // Update settings feedback and clear any previous state marker when none is supplied.
  function setStatusMessage(text, state = '') {
    const msgEl = $('settings-message');
    if (!msgEl) return;
    msgEl.textContent = text;
    if (state) {
      msgEl.dataset.state = state;
    } else {
      delete msgEl.dataset.state;
    }
  }

  // Rebuild the selected settings section and reconnect its controls to the in-memory preferences.
  function render() {
    const h = headings[current];
    $('settings-panel').innerHTML = `
      <div class="settings-panel-head">
        <h2>${h[0]}</h2>
      </div>
      <p class="settings-panel-subtitle">${h[1]}</p>
      <div class="setting-grid">${cards[current]().join('')}</div>
    `;

    window.NGControlsUI?.mount();
    window.NGOfflineUI?.mount();

    document.querySelectorAll('[data-pref]').forEach(el =>
      // Stage preference changes without persisting them until the save action.
      el.addEventListener('change', e => {
        const key = e.target.dataset.pref;
        prefs[key] =
          e.target.type === 'checkbox'
            ? e.target.checked
            : e.target.type === 'range'
              ? Number(e.target.value)
              : e.target.value;
        if (key === 'volume') $('volume-output').textContent = String(prefs.volume) + '%';
        setStatusMessage(
          NGI18n.t('settings.you_have_unsaved_changes_select_save_changes'),
          'warn'
        );
      })
    );

    const slider = document.querySelector('input[data-pref="volume"]');
    if (slider) {
      // Synchronize the volume slider fill and percentage during input.
      const update = () => {
        slider.style.setProperty('--ng-progress', slider.value + '%');
        $('volume-output').textContent = slider.value + '%';
      };
      slider.addEventListener('input', update);
      update();
    }

    const pad = $('test-gamepad');
    if (pad) {
      // Query currently exposed gamepads and display the detected device names.
      pad.addEventListener('click', () => {
        const arr =
          typeof navigator.getGamepads === 'function'
            ? Array.from(navigator.getGamepads()).filter(Boolean)
            : [];
        const resBox = $('gamepad-result');
        if (!resBox) return;
        resBox.textContent = arr.length
          ? NGI18n.t('settings.detected') + ' ' + arr.map(g => g.id).join(' | ')
          : NGI18n.t('settings.no_active_controllers_detected_connect_one_press');
        resBox.dataset.detected = arr.length ? 'true' : 'false';
      });
    }
  }

  // Switch settings sections and update the selected tab before rendering.
  document.querySelectorAll('[data-tab]').forEach(b =>
    b.addEventListener('click', () => {
      current = b.dataset.tab;
      document
        .querySelectorAll('[data-tab]')
        .forEach(x => x.setAttribute('aria-selected', String(x === b)));
      render();
    })
  );

  // Sanitize and persist staged preferences, then report storage success or failure.
  $('save-settings').addEventListener('click', () => {
    prefs = sanitize(prefs);
    const ok = save(prefs);
    setStatusMessage(
      ok
        ? NGI18n.t('settings.settings_saved_locally_game_preferences_apply_to')
        : NGI18n.t('settings.could_not_save_to_browser_storage'),
      ok ? 'success' : 'error'
    );
    render();
  });

  // Restore and persist defaults before redrawing the settings section.
  $('reset-settings').addEventListener('click', () => {
    prefs = { ...DEFAULTS };
    save(prefs);
    render();
    setStatusMessage(NGI18n.t('settings.defaults_restored'), 'info');
  });

  render();

  (window.NG_STATIC
    ? NGLocal.init().then(() => ({
        ok: true,
        json: async () => NGLocal.data()
      }))
    : fetch('/api/status', { cache: 'no-store' })
  )

    // Reject failed status responses before reading their JSON payload.
    .then(r => {
      if (!r.ok) throw Error('HTTP ' + r.status);
      return r.json();
    })

    // Populate engine and library status, then redraw with the available summary.
    .then(d => {
      summary = d.summary;
      const engine = d.engine;
      $('settings-engine-status').textContent = window.NG_STATIC
        ? `FBNEO + WEBASSEMBLY\nPINNED STATIC BUILD\n${summary.games} ROMs · ${summary.with_screenshots} screenshots`
        : `FBNEO + WEBASSEMBLY\n${engine.ready ? 'ENGINE READY' : 'ENGINE INCOMPLETE'} · ${engine.found}/${engine.total}\n${summary.games} ROMs · ${summary.with_screenshots} screenshots`;
      render();
    })

    // Expose status-loading failures in the engine status panel.
    .catch(e => {
      $('settings-engine-status').textContent = 'LOCAL STATUS UNAVAILABLE: ' + e.message;
    });
})();
