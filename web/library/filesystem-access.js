'use strict';
(function (root) {
  // Rejects unsafe or overlong leaf names before they enter a virtual file listing.
  const validName = name =>
    typeof name === 'string' &&
    name.length < 200 &&
    !/[\\/\x00]/.test(name) &&
    name !== '.' &&
    name !== '..';

  /**
   * Reports read access, treating wrappers without permission APIs as granted.
   * Requests native access only when request is true and the queried state is prompt.
   */
  async function permission(handle, request = false) {
    if (!handle) return 'missing';
    if (!handle.queryPermission) return 'granted';
    const options = { mode: 'read' };
    const state = await handle.queryPermission(options);
    return state === 'prompt' && request ? handle.requestPermission(options) : state;
  }

  // Checks read access and indexes direct file children by lowercase name, rejecting duplicates.
  async function files(handle) {
    if ((await permission(handle)) !== 'granted')
      throw new DOMException('Permission Required', 'NotAllowedError');
    if (handle.kind === 'file') return new Map([[handle.name.toLowerCase(), handle]]);
    const result = new Map();
    for await (const [name, child] of handle.entries()) {
      if (child.kind === 'file' && validName(name)) {
        const key = name.toLowerCase();
        if (result.has(key))
          throw Error(NGI18n.t('filesystem_access.duplicate_filenames') + ' ' + name);
        result.set(key, child);
      }
    }
    return result;
  }

  // Wraps selected Files as session-only file or directory adapters without copying their bytes.
  function fromFiles(role, selected, name, directory = false) {
    const entries = selected
      .filter(f => validName(f.name))
      .map(file => [
        file.name,
        {
          kind: 'file',
          name: file.name,

          // Returns the captured File without reopening a native picker.
          getFile: async () => file
        }
      ]);
    return role === 'bios' && !directory
      ? { ...entries[0]?.[1], fallback: true }
      : {
          kind: 'directory',
          name: name || selected[0]?.webkitRelativePath?.split('/')[0] || 'Files',
          fallback: true,

          // Yields the captured name/adapter pairs rather than rescanning the filesystem.
          async *entries() {
            yield* entries;
          }
        };
  }

  // Removes the temporary input before resolving session adapters or a null cancellation.
  function fallback(role, directory = false) {
    return new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      input.hidden = true;
      if (role !== 'bios' || directory) {
        input.webkitdirectory = true;
        input.multiple = true;
      } else input.accept = '.zip';
      input.oncancel = () => {
        input.remove();
        resolve(null);
      };

      // Captures the selection before removing the input and preserves its requested directory mode.
      input.onchange = () => {
        const selected = [...input.files];
        input.remove();
        if (!selected.length) return resolve(null);
        resolve(fromFiles(role, selected, undefined, directory));
      };
      document.body.append(input);
      input.click();
    });
  }

  // Uses available native pickers, otherwise falls back to a session-only file input.
  async function pick(role, directory = false) {
    if (role === 'bios' && !directory && root.showOpenFilePicker) {
      const [file] = await root.showOpenFilePicker({
        id: 'neogeo-bios',
        multiple: false,
        types: [{ description: 'Neo Geo BIOS ZIP', accept: { 'application/zip': ['.zip'] } }]
      });
      return file;
    }
    if (root.showDirectoryPicker)
      return root.showDirectoryPicker({ id: 'neogeo-' + role, mode: 'read' });
    return fallback(role, directory);
  }
  // Call requestPermission synchronously in the click stack: no preceding await/query.
  function request(handle) {
    if (!handle) return Promise.resolve('missing');
    return typeof handle.requestPermission === 'function'
      ? handle.requestPermission({ mode: 'read' })
      : Promise.resolve('granted');
  }
  root.NGFileAccess = {
    permission,
    request,
    files,
    pick,
    fromFiles,
    validName,

    // Reports directory-picker availability without requesting permission.
    supported: () => typeof root.showDirectoryPicker === 'function',

    // Returns picker API types for capability diagnostics, not permission state.
    capabilities: () => ({
      directoryPicker: typeof root.showDirectoryPicker,
      filePicker: typeof root.showOpenFilePicker
    })
  };
})(globalThis);
