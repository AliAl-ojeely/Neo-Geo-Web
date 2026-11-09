/* Presentation layer for the global NeoRAGEx keyboard profile; no Core/vendor changes. */
'use strict';
(() => {
  // Escape labels before interpolating them into the generated HTML.
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

  let player = 0;
  let active = null;

  // Resolve the shared controls API when the UI needs it.
  const ctl = () => window.NGControls;

  // Update the feedback text and its presentation state when the element exists.
  const notify = (msg, type = '') => {
    const e = document.getElementById('controls-feedback');
    if (e) {
      e.textContent = msg;
      e.dataset.type = type;
    }
  };

  // Rebuild the selected player panel from the saved profile and attach its action handlers.
  function render() {
    const root = document.getElementById('global-controls-root');
    if (!root || !ctl()) return;
    const state = ctl().load();

    root.innerHTML = `
      <div class="global-controls-intro">
        <div>
          <strong>${NGI18n.t('controls_ui.one_control_profile_for_all_neo_geo')}</strong>
          <p>${NGI18n.t('controls_ui.your_custom_layout_for_both_players_updated')}</p>
        </div>
        <span class="control-source-badge">Neo Geo Custom</span>
      </div>

      <div class="player-control-tabs" role="tablist" aria-label="${NGI18n.t('controls_ui.player')}">
        <button type="button" role="tab" data-controls-player="0" aria-selected="${player === 0}">${NGI18n.t('controls_ui.player_1_p1')}</button>
        <button type="button" role="tab" data-controls-player="1" aria-selected="${player === 1}">${NGI18n.t('controls_ui.player_2_p2')}</button>
      </div>

      <div class="controls-grid">
        ${ctl()
          .ACTIONS.map(
            a => `
          <div class="control-item">
            <span class="control-action">
              <span class="control-symbol" aria-hidden="true">${safe(a.symbol)}</span>
              <span>${safe(a.label)}</span>
            </span>
            <button type="button" class="control-key" data-bind-action="${a.id}" aria-label="${NGI18n.t('controls_ui.change_p3', { p3: safe(a.label) })}">
              <kbd>${safe(ctl().getLabel(state.players[player][a.id]))}</kbd>
              <span>${NGI18n.t('controls_ui.change')}</span>
            </button>
          </div>`
          )
          .join('')}
      </div>

      <p class="controls-gamepad-note">${NGI18n.t('controls_ui.player_2_needs_num_lock_for_the')}</p>

      <div class="global-controls-actions">
        <button type="button" data-controls-reset>${NGI18n.t('controls_ui.restore_custom_layout')}</button>
        <button type="button" data-controls-export>${NGI18n.t('controls_ui.export_controls_json')}</button>
        <button type="button" data-controls-import>${NGI18n.t('controls_ui.import_controls_json')}</button>
        <input type="file" id="controls-import-file" accept="application/json,.json" hidden>
      </div>

      <p id="controls-feedback" class="controls-feedback" role="status">${NGI18n.t('controls_ui.select_a_binding_and_press_a_key')}</p>
    `;

    // Switch players and discard any pending key capture before rebuilding the panel.
    root.querySelectorAll('[data-controls-player]').forEach(b =>
      b.addEventListener('click', async () => {
        player = Number(b.dataset.controlsPlayer);
        active = null;
        render();
      })
    );

    // Record the target action and highlight its button until a key is accepted or capture is cancelled.
    root.querySelectorAll('[data-bind-action]').forEach(b =>
      b.addEventListener('click', async () => {
        active = { player, action: b.dataset.bindAction };
        root
          .querySelectorAll('.control-key')
          .forEach(x => x.classList.toggle('is-recording', x === b));
        b.querySelector('kbd').textContent = NGI18n.t('controls_ui.press_a_key');
        notify(
          NGI18n.t('controls_ui.press_a_key_to_assign_it_to') +
            ' ' +
            ctl().ACTIONS.find(x => x.id === active.action).label +
            NGI18n.t('controls_ui.or_esc_to_cancel')
        );
      })
    );

    // Confirm before replacing the saved profile and report persistence failures.
    root.querySelector('[data-controls-reset]').addEventListener('click', async () => {
      active = null;
      if (
        !(await (window.NGDialog?.confirm(
          NGI18n.t('controls_ui.restore_the_custom_layout_for_both_players'),
          NGI18n.t('controls_ui.restore_controls')
        ) ?? Promise.resolve(false)))
      ) {
        return;
      }
      const ok = ctl().reset();
      render();
      notify(
        ok
          ? NGI18n.t('controls_ui.default_player_bindings_restored')
          : NGI18n.t('controls_ui.could_not_save_settings'),
        ok ? 'success' : 'error'
      );
    });

    // Download the profile as JSON and release the temporary object URL after the click.
    root.querySelector('[data-controls-export]').addEventListener('click', async () => {
      const blob = new Blob([ctl().exportJSON()], {
        type: 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'NeoGeo_Global_Controls.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify(NGI18n.t('controls_ui.controls_json_is_ready_to_download'), 'success');
    });

    root
      .querySelector('[data-controls-import]')
      .addEventListener('click', () => root.querySelector('#controls-import-file').click());

    // Read the chosen JSON file and display validation or file-reading errors.
    root.querySelector('#controls-import-file').addEventListener('change', async e => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const r = ctl().importJSON(await file.text());
        render();
        notify(
          r.ok
            ? NGI18n.t('controls_ui.global_bindings_imported')
            : NGI18n.t('controls_ui.bindings_file_rejected') + ' ' + r.error,
          r.ok ? 'success' : 'error'
        );
      } catch (err) {
        notify(NGI18n.t('controls_ui.could_not_read_the_bindings_file'), 'error');
      }
    });
  }

  // Capture a pending binding before other handlers, allowing Escape to cancel and rejecting modifiers.
  function keydown(event) {
    if (!active) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.key === 'Escape') {
      active = null;
      render();
      notify(NGI18n.t('controls_ui.key_capture_cancelled'));
      return;
    }
    if (event.ctrlKey || event.altKey || event.metaKey) {
      notify(NGI18n.t('controls_ui.use_a_single_key_without_ctrl_alt'), 'error');
      return;
    }
    const capture = active;
    const r = ctl().setKey(capture.player, capture.action, event.keyCode);
    if (!r.ok) {
      notify(
        r.error === 'KEY_CONFLICT'
          ? NGI18n.t('controls_ui.this_key_is_already_assigned_to') + ' ' + r.conflict
          : NGI18n.t('controls_ui.this_key_is_unsupported_or_conflicts_with'),
        'error'
      );
      return;
    }
    active = null;
    render();
    notify(NGI18n.t('controls_ui.key_saved_it_will_apply_to_all'), 'success');
  }

  // Refresh translated labels in place, retaining pending key capture and every event handler.
  document.addEventListener('ng-language-changed', () => {
    const root = document.getElementById('global-controls-root');
    if (!root || !ctl()) return;
    const state = ctl().load();
    for (const button of root.querySelectorAll('[data-bind-action]')) {
      const action = ctl().ACTIONS.find(item => item.id === button.dataset.bindAction);
      if (!action) continue;
      button.setAttribute(
        'aria-label',
        NGI18n.t('controls_ui.change_p3', { p3: action.label })
      );
      if (!button.classList.contains('is-recording'))
        button.querySelector('kbd').textContent = ctl().getLabel(
          state.players[player][action.id]
        );
    }
  });

  window.NGControlsUI = Object.freeze({ mount: render });
  document.addEventListener('keydown', keydown, true);
  // Cancel unfinished key capture when the window loses focus.
  window.addEventListener('blur', () => {
    if (active) {
      active = null;
      render();
      notify(NGI18n.t('controls_ui.key_capture_cancelled_because_the_window_lost'));
    }
  });
})();
