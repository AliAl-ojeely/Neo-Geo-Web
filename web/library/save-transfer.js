'use strict';
// Export/import actual EmulatorJS state bytes. Origin changes never migrate IDB silently.
(function (root) {
  // Adds state-transfer buttons only on player pages and routes action failures to dialog or console.
  function attach() {
    if (!document.getElementById('game')) return;
    const bar = document.querySelector('.player-diagnostics');
    if (!bar) return;
    for (const [label, action] of [
      [NGI18n.t('save_transfer.export_save_state'), exportState],
      [NGI18n.t('save_transfer.import_save_state'), importState]
    ]) {
      const b = document.createElement('button');
      b.textContent = label;
      b.onclick = () =>
        action().catch(e => root.NGDialog?.alert(e.message) || console.error(e));
      bar.append(b);
    }
  }

  // Returns a started emulator with a game manager, or throws before any state transfer.
  function emulator() {
    const e = root.EJS_emulator;
    if (!e?.gameManager || !e.started)
      throw Error(NGI18n.t('save_transfer.start_the_game_first'));
    return e;
  }

  // Downloads the current state under its stable game name and revokes its URL after the click.
  async function exportState() {
    const e = emulator(),
      bytes = e.gameManager.getState();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes]));
    a.download = e.getBaseFileName() + '.state';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // Opens a state-file input; its change handler checks size and state guards before native loading.
  async function importState() {
    const e = emulator(),
      input = document.createElement('input');
    input.type = 'file';
    input.accept = '.state';

    // Reads the selected state, validates its envelope, and surfaces guard rejection or read errors.
    input.onchange = async () => {
      try {
        const file = input.files[0];
        if (file.size > 128 * 1024 * 1024)
          throw Error(NGI18n.t('save_transfer.unsupported_save_state_file_size'));
        const b = new Uint8Array(await file.arrayBuffer());
        root.NGStateGuard.inspect(b);
        e.gameManager.loadState(b);
        if (e.gameManager.__ngStateGuard?.lastRejection)
          throw Error(e.gameManager.__ngStateGuard.lastRejection.message);
      } catch (error) {
        root.NGDialog?.alert(error.message) || console.error(error);
      }
    };
    input.click();
  }
  root.NGSaveTransfer = { exportState, importState };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach);
  else attach();
})(globalThis);
