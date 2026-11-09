'use strict';
// Preserve FBNeo selected-BIOS policy, then install the global keyboard adapter.
// No ROM/BIOS/WASM, game-save IDs, or persisted EJS preferences are rewritten.
(function () {
  document.addEventListener(
    'load',

    // Patch each EmulatorJS prototype once when its script finishes loading.
    function hook(event) {
      if (
        event.target?.tagName !== 'SCRIPT' ||
        !/(?:emulator\.min|emulator)\.js(?:$|\?)/.test(event.target.src)
      )
        return;
      if (typeof EmulatorJS === 'undefined') return;
      const proto = EmulatorJS.prototype;
      if (proto.__ngControlsPatchV2) return;
      const original = proto.getCoreSettings,
        load = proto.loadSettings,
        keyChange = proto.keyChange;
      if (
        typeof original !== 'function' ||
        typeof load !== 'function' ||
        typeof keyChange !== 'function'
      )
        return;

      // Replace conflicting BIOS policy options while preserving all other core settings.
      proto.getCoreSettings = function () {
        const settings = original
          .call(this)
          .replace(/^fbneo-(?:neogeo-mode|allow-patched-romsets)\s*=.*(?:\r?\n|$)/gm, '');
        return (
          settings +
          '\nfbneo-neogeo-mode = "MVS_EUR"\nfbneo-allow-patched-romsets = "disabled"\n'
        );
      };

      // Apply the BIOS policy and global keyboard profile after native settings are loaded.
      proto.loadSettings = function (...args) {
        const result = load.apply(this, args);
        this.changeSettingOption?.('fbneo-neogeo-mode', 'MVS_EUR', true);
        this.changeSettingOption?.('fbneo-allow-patched-romsets', 'disabled', true);
        window.NGControls?.applyToEmulator(this);
        return result;
      };
      // IMPORTANT: patch prototype before EmulatorJS binds keyChange to its player element.
      // Original key handler is preserved for unmapped keys and native control-settings popups.
      proto.keyChange = function (event) {
        if (window.NGControls?.handleKeyChange?.(this, event)) return;
        return keyChange.call(this, event);
      };
      Object.defineProperty(proto, '__ngControlsPatchV2', { value: true, configurable: false });
      document.removeEventListener('load', hook, true);
    },
    true
  );
})();
