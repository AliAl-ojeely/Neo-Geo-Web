/* Local-only last-played identity; no ROM data, BIOS, or filesystem paths. */
'use strict';
(function (root) {
  const KEY = 'neogeo-last-played-v1';
  const VALID_ROM = /^[a-zA-Z0-9_.+ -]+\.zip$/;

  // Retain only a library ROM filename and timestamp, not user file handles.
  function validFilename(value) {
    return typeof value === 'string' && !value.startsWith('.') && VALID_ROM.test(value);
  }

  // A missing, invalid, or inaccessible record falls back to the featured game.
  function read() {
    try {
      const raw = root.localStorage?.getItem(KEY);
      if (!raw) return null;
      const item = JSON.parse(raw);
      if (!item || !validFilename(item.filename)) return null;
      return { filename: item.filename, playedAt: Number(item.playedAt) || 0 };
    } catch {
      return null;
    }
  }

  // Called only after EmulatorJS announces that a game actually started.
  function record(filename) {
    if (!validFilename(filename)) return false;
    try {
      root.localStorage?.setItem(KEY, JSON.stringify({ filename, playedAt: Date.now() }));
      return !!root.localStorage;
    } catch {
      return false;
    }
  }

  root.NGLastPlayed = Object.freeze({ read, record });
})(window);
