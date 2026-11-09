'use strict';
(function (root) {
  let panel, status, pending;

  const messages = {
    ROM_DIRECTORY_PERMISSION_REQUIRED: NGI18n.t(
      'player_recovery.renew_permission_to_read_the_roms_folder'
    ),
    ROM_DIRECTORY_NOT_CONNECTED: NGI18n.t('player_recovery.the_roms_folder_is_not_connected'),
    ROM_FILE_NOT_FOUND: NGI18n.t('player_recovery.the_required_game_file_is_not_in'),
    ROM_SIZE_MISMATCH: NGI18n.t('player_recovery.the_file_size_differs_use_the_prepared'),
    ROM_HASH_MISMATCH: NGI18n.t('player_recovery.game_bytes_do_not_match_the_verified'),
    BIOS_PERMISSION_REQUIRED: NGI18n.t('player_recovery.renew_permission_to_read_bios'),
    BIOS_NOT_CONNECTED: NGI18n.t('player_recovery.select_the_inner_bios_file_neogeo_zip'),
    BIOS_INVALID: NGI18n.t('player_recovery.the_bios_hash_does_not_match_extract'),
    FALLBACK_SESSION_ONLY: NGI18n.t('player_recovery.the_previous_file_input_session_has_ended')
  };

  // Creates recovery controls once and inserts them after the player status message.
  function ensure() {
    if (panel) return;
    panel = document.createElement('section');
    panel.id = 'player-recovery';
    panel.className = 'player-message recovery-modal-card';

    const heading = document.createElement('h2');
    heading.className = 'recovery-card-title';
    heading.textContent = NGI18n.t(
      'player_recovery.reconnect_game_files_and_bios_without_leaving'
    );
    panel.append(heading);

    status = document.createElement('pre');
    status.id = 'player-recovery-status';
    status.className = 'recovery-status-log';
    status.style.whiteSpace = 'pre-wrap';
    status.setAttribute('role', 'status');
    panel.append(status);

    const actions = document.createElement('div');
    actions.className = 'setting-actions recovery-actions-grid';
    panel.append(actions);

    // Binds an action that starts synchronously on click and reports thrown or rejected failures.
    function button(id, text, fn, cls = '') {
      const b = document.createElement('button');
      b.id = id;
      b.type = 'button';
      if (cls) b.className = cls;
      b.textContent = text;
      b.onclick = () => {
        try {
          const work = fn();
          Promise.resolve(work).catch(showActionError);
        } catch (e) {
          showActionError(e);
        }
      };
      actions.append(b);
    }

    button('recover-rom-permission', NGI18n.t('player_recovery.allow_roms_access'), () =>
      NGLocal.reconnect('roms').then(refresh)
    );
    button(
      'recover-rom-select',
      NGI18n.t('library_ui.select_roms_folder'),
      () =>
        NGLocal.select('roms')
          .then(() => NGLocal.save())
          .then(refresh),
      'secondary'
    );
    button('recover-bios-permission', NGI18n.t('player_recovery.allow_bios_access'), () =>
      NGLocal.reconnect('bios').then(refresh)
    );
    button(
      'recover-bios-select',
      NGI18n.t('player_recovery.select_neogeo_zip'),
      () =>
        NGLocal.select('bios')
          .then(() => NGLocal.save())
          .then(refresh),
      'secondary'
    );
    button(
      'recover-bios-directory',
      NGI18n.t('library_ui.select_bios_folder'),
      () =>
        NGLocal.select('bios', true)
          .then(() => NGLocal.save())
          .then(refresh),
      'secondary'
    );
    button(
      'recover-retry',
      NGI18n.t('player_recovery.retry_launch_now'),

      // Rescans before hiding recovery and resolving the retry, without reloading the page.
      async () => {
        await NGLocal.scan();
        panel.hidden = true;
        const resolve = pending;
        pending = null;
        resolve?.();
      },
      'retry-highlight-btn'
    );

    const note = document.createElement('p');
    note.className = 'recovery-footnote';
    note.textContent = NGI18n.t('player_recovery.file_input_fallback_lasts_only_for_the');
    panel.append(note);
    document.getElementById('player-message').after(panel);
  }

  // Appends action failures to recovery status while ignoring picker cancellation.
  function showActionError(e) {
    if (e.name !== 'AbortError')
      status.textContent += '\n' + (e.code || e.name) + ': ' + e.message;
  }

  // Displays the URL-selected catalog entry, current source states, and current origin.
  function refresh() {
    const g = NGLocal.catalogGame(new URLSearchParams(location.search).get('rom'));
    status.textContent =
      (status.dataset.error || '') +
      '\n' +
      NGI18n.t('player_recovery.required') +
      ' ' +
      (g?.selected_filename || '') +
      ' / Driver: ' +
      (g?.driver || '') +
      ' ' +
      NGI18n.t('player_recovery.size') +
      ' ' +
      (g?.size || '') +
      '\nROMs: ' +
      NGLocal.states.roms +
      ' / BIOS: ' +
      (NGLocal.bios ? 'VALID' : NGLocal.states.bios) +
      '\nOrigin: ' +
      location.origin;
  }

  /**
   * Shows a recoverable failure and returns a promise resolved by the retry button.
   * Displayed game metadata comes from the URL; the filename parameter is currently unused.
   */
  function wait(error, filename) {
    ensure();
    panel.hidden = false;
    status.dataset.error =
      error.code +
      ': ' +
      NGI18n.translateText(messages[error.code] || error.message) +
      '\n' +
      JSON.stringify(error.details || {});
    refresh();
    const msg = document.getElementById('player-message');
    msg.hidden = false;
    msg.textContent = NGI18n.t(
      'player_recovery.waiting_for_files_or_renewed_permission_continue'
    );
    msg.className = 'player-message warn';
    root.NGRuntimeDiagnostics?.event('LOCAL_LIBRARY_RECOVERY', 'WAITING', {
      code: error.code,
      ...error.details
    });
    return new Promise(resolve => {
      pending = resolve;
    });
  }

  // Adds explicit-consent copy controls for the prepared bundle and per-game copy removal.
  function copyControls(local) {
    if (document.getElementById('local-copy-controls')) return;
    const box = document.createElement('details');
    box.id = 'local-copy-controls';
    box.className = 'player-diagnostics local-copy-vault';

    const summary = document.createElement('summary');
    summary.textContent = NGI18n.t(
      'player_recovery.optional_browser_vault_keep_only_this_game'
    );
    box.append(summary);

    const body = document.createElement('div');
    body.className = 'vault-body-wrap';

    const label = document.createElement('label');
    label.className = 'vault-consent-label';
    const consent = document.createElement('input');
    consent.type = 'checkbox';
    consent.id = 'local-copy-consent';
    label.append(
      consent,
      document.createTextNode(
        ' ' +
          NGI18n.t('player_recovery.i_explicitly_agree_to_copy') +
          ' ' +
          local.game.selected_filename +
          ' ' +
          NGI18n.t('player_recovery.and_bios_only') +
          (local.rom.size + local.bios.length).toLocaleString() +
          ' ' +
          NGI18n.t('player_recovery.bytes_into_this_site_s_indexeddb_storage')
      )
    );
    body.append(label);

    const btnRow = document.createElement('div');
    btnRow.className = 'vault-actions-row';

    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'local-copy-save';
    button.className = 'primary-vault-btn';
    button.textContent = NGI18n.t('player_recovery.save_optional_copy');
    button.disabled = true;
    consent.onchange = () => {
      button.disabled = !consent.checked;
    };

    const result = document.createElement('p');
    result.id = 'local-copy-status';
    result.className = 'vault-status-text';

    // Writes the optional copy only while consent is checked and re-enables saving on failure.
    button.onclick = async () => {
      if (!consent.checked) return;
      button.disabled = true;
      try {
        await NGLocal.keepGame(local, { consent: consent.checked });
        result.textContent = NGI18n.t('player_recovery.local_copy_saved_this_game_and_bios');
      } catch (e) {
        result.textContent = 'LOCAL_COPY_STORAGE_ERROR: ' + e.message;
        button.disabled = false;
      }
    };

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.id = 'local-copy-remove';
    remove.className = 'danger-vault-btn';
    remove.textContent = NGI18n.t('player_recovery.remove_this_game_s_browser_copy');

    // Deletes this game's optional copy and rescans without deleting original files or save states.
    remove.onclick = async () => {
      try {
        await NGLibraryStore.remove('localCopies', local.game.filename);
        await NGLocal.scan();
        result.textContent = NGI18n.t(
          'player_recovery.local_copy_removed_the_browser_copy_was'
        );
      } catch (e) {
        result.textContent = e.message;
      }
    };

    btnRow.append(button, remove);
    body.append(btnRow, result);
    box.append(body);
    document.querySelector('.player-diagnostics').after(box);
  }

  document.addEventListener('ng-language-changed', () => {
    if (status && !panel.hidden) refresh();
  });
  root.NGPlayerRecovery = { wait, copyControls };
})(globalThis);
