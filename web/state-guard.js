'use strict';
(function (root) {
  // RASTATE1 layout is from the pinned RetroArch task_save.c, not a guessed header.

  // Validate byte bounds and RASTATE1 block structure; return total and core-memory sizes.
  function inspect(value) {
    if (!ArrayBuffer.isView(value) || value.BYTES_PER_ELEMENT !== 1)
      throw Error(NGI18n.t('errors.stateBytes'));
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    if (bytes.length < 24 || bytes.length > 128 * 1024 * 1024)
      throw Error(NGI18n.t('errors.stateBounds'));
    if (String.fromCharCode(...bytes.subarray(0, 7)) !== 'RASTATE' || bytes[7] !== 1)
      throw Error(NGI18n.t('errors.stateHeader'));
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 8,
      memory = null,
      end = false;
    while (offset < bytes.length) {
      if (offset + 8 > bytes.length) throw Error(NGI18n.t('errors.stateBlockHeader'));
      const tag = String.fromCharCode(...bytes.subarray(offset, offset + 4)),
        size = view.getUint32(offset + 4, true);
      offset += 8;
      if (tag === 'END ') {
        if (size !== 0 || offset !== bytes.length) throw Error(NGI18n.t('errors.stateEnd'));
        end = true;
        break;
      }
      const aligned = Math.ceil(size / 8) * 8;
      if (offset + aligned > bytes.length) throw Error(NGI18n.t('errors.stateBlockSize'));
      if (tag === 'MEM ') {
        if (memory !== null || !size) throw Error(NGI18n.t('errors.stateMemory'));
        memory = size;
      } else if (!['ACHV', 'RPLY'].includes(tag)) throw Error(NGI18n.t('errors.stateBlock'));
      offset += aligned;
    }
    if (!end || memory === null) throw Error(NGI18n.t('errors.stateMissing'));
    return { bytes: bytes.length, memoryBytes: memory, format: 'RASTATE1' };
  }

  // Install one load-state wrapper that rejects invalid or differently sized core-memory blocks.
  function install(emulator, diagnostics) {
    const manager = emulator?.gameManager;
    if (!manager?.functions?.loadState || manager.__ngStateGuard)
      return manager?.__ngStateGuard;
    const native = manager.functions.loadState;
    const guard = { lastRejection: null, accepted: 0, rejected: 0 };

    // Validate incoming and current states before delegating; return -1 on rejection.
    manager.functions.loadState = function (path, ...args) {
      try {
        const incoming = inspect(manager.FS.readFile(path)),
          current = inspect(manager.getState());
        if (incoming.memoryBytes !== current.memoryBytes)
          throw Error(NGI18n.t('errors.stateGame'));
        guard.lastRejection = null;
        guard.accepted++;
        diagnostics?.event('STATE_LOAD_VALIDATED', 'OBSERVED', incoming);
      } catch (error) {
        guard.rejected++;
        guard.lastRejection = { message: error.message, path: String(path).split('/').pop() };
        diagnostics?.event('STATE_LOAD_REJECTED', 'REJECTED', guard.lastRejection);
        emulator.displayMessage?.(
          NGI18n.t('state_guard.this_save_state_is_damaged_or_incompatible')
        );
        return -1;
      }
      return native.call(this, path, ...args);
    };
    manager.__ngStateGuard = guard;
    return guard;
  }
  root.NGStateGuard = { inspect, install };
})(typeof window !== 'undefined' ? window : globalThis);
