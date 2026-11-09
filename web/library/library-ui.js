'use strict';
(function () {
  // Creates the library panel on collection pages and binds its source and storage actions.
  async function setup() {
    if (!document.getElementById('collection')) return;

    const panel = document.createElement('details');
    panel.id = 'local-library';
    panel.open = true;
    panel.className = 'player-diagnostics local-library-deck';
    panel.innerHTML = `
      <summary>
        <span class="deck-summary-title">${NGI18n.t('library_ui.local_library_manager')}</span>
      </summary>
      <div class="local-deck-body">
        <div id="library-status" class="library-slots-grid" role="status"></div>

        <div class="setting-actions deck-actions-bar">
          <div class="deck-action-group">
            <button type="button" class="slot-pick-btn" data-pick="roms">${NGI18n.t('library_ui.select_roms_folder')}</button>
            <button type="button" class="slot-pick-btn" data-pick="previews">${NGI18n.t('library_ui.select_previews_folder')}</button>
            <button type="button" class="slot-pick-btn" data-pick="bios">${NGI18n.t('library_ui.select_bios_file_neogeo_zip')}</button>
            <button type="button" class="slot-pick-btn secondary" data-pick="bios" data-directory="true">${NGI18n.t('library_ui.select_bios_folder')}</button>
          </div>
          <div class="deck-action-group deck-utility-group">
            <button type="button" id="library-save" class="primary-deck-btn">${NGI18n.t('library_ui.save_library')}</button>
            <button type="button" id="library-reconnect" class="slot-pick-btn">${NGI18n.t('library_ui.reconnect_saved_sources')}</button>
            <button type="button" id="library-scan" class="slot-pick-btn">${NGI18n.t('library_ui.rescan')}</button>
            <button type="button" id="library-persist" class="slot-pick-btn">${NGI18n.t('library_ui.protect_browser_storage')}</button>
            <button type="button" id="library-forget" class="slot-pick-btn danger-deck-btn">${NGI18n.t('library_ui.forget_references')}</button>
          </div>
        </div>

        <p class="deck-footnote">${NGI18n.t('library_ui.local_read_access_only_files_are_not')} <code dir="ltr">neogeo.zip</code> ${NGI18n.t('library_ui.after_extracting_the_package_or_drop_a')}</p>
      </div>`;

    document.getElementById('collection').before(panel);

    const status = panel.querySelector('#library-status');
    const labels = {
      'fallback-session-only': NGI18n.t('library_ui.file_session_expired_select_files_again'),
      granted: NGI18n.t('library_ui.connected'),
      prompt: NGI18n.t('library_ui.permission_renewal_required'),
      denied: NGI18n.t('library_ui.permission_denied'),
      missing: NGI18n.t('library_ui.not_connected'),
      invalid: NGI18n.t('library_ui.file_does_not_match'),
      error: NGI18n.t('library_ui.could_not_read'),
      'storage-error': NGI18n.t('library_ui.storage_unavailable')
    };
    const roleTitles = {
      roms: NGI18n.t('library_ui.roms_game_files'),
      previews: NGI18n.t('library_ui.previews_game_images'),
      bios: NGI18n.t('library_ui.bios_system_files')
    };

    // Rebuilds source cards and notices from current states without requesting access or reading ROM bytes.
    function render() {
      status.replaceChildren();

      for (const r of ['roms', 'previews', 'bios']) {
        const st = NGLocal.states[r] || 'missing';
        const isCompanion = Boolean(NGLocal.handles[r]?.companion);
        const stateText = isCompanion
          ? NGI18n.t('library_ui.connected_through_local_companion')
          : NGI18n.translateText(labels[st] || NGI18n.t('library_ui.not_connected'));
        const sourceName = NGLocal.handles[r]?.name || NGI18n.t('library_ui.not_selected');
        const fileCount = NGLocal.maps[r]?.size || 0;

        const card = document.createElement('div');
        card.className = 'slot-status-card state-' + st + (isCompanion ? ' state-granted' : '');

        const headerRow = document.createElement('div');
        headerRow.className = 'slot-card-header';

        const head = document.createElement('strong');
        head.className = 'slot-card-title';
        head.textContent = NGI18n.translateText(roleTitles[r]);

        const badge = document.createElement('span');
        badge.className = 'slot-state-pill';
        badge.textContent = stateText;

        headerRow.append(head, badge);

        const line = document.createElement('p');
        line.className = 'slot-card-detail';
        line.textContent = NGI18n.t('library_ui.p0_p1_p2_p3_files', {
          p0: r.toUpperCase(),
          p1: stateText,
          p2: sourceName,
          p3: fileCount
        });

        card.append(headerRow, line);
        status.append(card);
      }

      for (const e of NGLocal.errors) {
        const p = document.createElement('p');
        p.className = 'deck-alert error';
        p.textContent = e;
        status.append(p);
      }

      const info = document.createElement('p');
      info.className = 'deck-alert info';
      info.textContent =
        (window.NGCompanion?.available
          ? NGI18n.t('library_ui.local_companion_connected_directories_are_saved_in') + ' '
          : '') +
        (Object.values(NGLocal.handles).some(h => h?.fallback)
          ? NGI18n.t('library_ui.fallback_session_only_selections_remain_available_while') + ' '
          : '') +
        NGLocal.games.length +
        ' ' +
        NGI18n.t('library_ui.files_match_the_expected_size_sha_256') +
        ' ' +
        (NGLocal.bios ? 'BIOS VALID ✓' : NGI18n.t('library_ui.bios_not_ready'));
      status.append(info);

      if (Object.values(NGLocal.states).includes('prompt')) {
        const p = document.createElement('p');
        p.className = 'deck-alert warn';
        p.textContent = NGI18n.t(
          'library_ui.saved_library_found_select_reconnect_saved_sources'
        );
        status.append(p);
      }

      if (Object.values(NGLocal.states).includes('denied')) {
        const p = document.createElement('p');
        p.className = 'deck-alert error';
        p.textContent = NGI18n.t('library_ui.permission_was_denied_for_one_source_select');
        status.append(p);
      }
    }

    // Invokes the action immediately, then renders its result or displays non-cancellation errors.
    async function run(fn) {
      try {
        await fn();
        render();
      } catch (e) {
        if (e.name !== 'AbortError') status.textContent = e.name + ': ' + e.message;
      }
    }

    panel.querySelectorAll('[data-pick]').forEach(b => {
      b.title = NGI18n.t('library_ui.click_to_select_or_drop_a_folder');

      // Uses the application dialog when available, deferring picker invocation to its confirmation click.
      b.onclick = () => {
        const role = b.dataset.pick;

        // Starts selection within the confirming click and refreshes the displayed source state.
        const doPick = () =>
          run(async () => {
            await NGLocal.select(role, b.dataset.directory === 'true');
            render();
          });
        if (window.NGDialog?.action) {
          window.NGDialog.action({
            title: NGI18n.t('library_ui.select_files_for') + ' ' + role.toUpperCase(),
            message: NGI18n.t('library_ui.your_browser_file_picker_will_open_brave'),
            confirmLabel: NGI18n.t('library_ui.choose_files'),
            onConfirm: doPick
          });
        } else {
          doPick();
        }
      };
      b.ondragover = e => {
        e.preventDefault();
        b.classList.add('drag-over');
      };
      b.ondragleave = () => b.classList.remove('drag-over');

      // Captures the dropped handle promise during the event, then adopts it through the UI error wrapper.
      b.ondrop = e => {
        e.preventDefault();
        b.classList.remove('drag-over');
        const item = e.dataTransfer.items[0];
        if (!item?.getAsFileSystemHandle) {
          status.textContent = NGI18n.t('library_ui.drag_and_drop_is_unavailable_use_the');
          return;
        }
        const handlePromise = item.getAsFileSystemHandle();
        run(async () => {
          await NGLocal.acceptHandle(b.dataset.pick, await handlePromise);
          render();
        });
      };
    });

    panel.querySelector('#library-save').onclick = () => run(() => NGLocal.save());

    // Requests access first, then refreshes saved companion sources through the same action wrapper.
    panel.querySelector('#library-reconnect').onclick = () =>
      run(() => NGLocal.reconnect().then(() => NGLocal.restoreSaved()));
    // Refresh companion listings instead of repeatedly scanning an old snapshot.
    panel.querySelector('#library-scan').onclick = () => run(() => NGLocal.restoreSaved());

    // Asks for confirmation when dialogs are available before forgetting library references.
    panel.querySelector('#library-forget').onclick = async () => {
      if (
        !window.NGDialog ||
        (await NGDialog.confirm(
          NGI18n.t('library_ui.forget_saved_library_references_your_game_files'),
          NGI18n.t('library_ui.forget_library_references')
        ))
      ) {
        run(() => NGLocal.forget());
      }
    };

    // Requests browser-storage persistence and reports the result without granting filesystem access.
    panel.querySelector('#library-persist').onclick = () =>
      run(async () => {
        const granted =
          typeof navigator.storage?.persist === 'function' &&
          (await navigator.storage.persist());
        await NGLocal.scan();
        const message = granted
          ? NGI18n.t('library_ui.persistent_storage_enabled_this_does_not_grant')
          : NGI18n.t('library_ui.the_browser_did_not_grant_extra_storage');
        window.NGDialog?.alert(message, NGI18n.t('library_ui.storage_status'));
      });

    document.addEventListener('ng-library-changed', render);
    document.addEventListener('ng-language-changed', render);
    await NGLocal.init();
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
})();
