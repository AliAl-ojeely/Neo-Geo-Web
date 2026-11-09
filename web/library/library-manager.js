'use strict';
(function (root) {
  const roles = ['roms', 'previews', 'bios'];
  const manager = {
    handles: {},
    states: {},
    maps: {},
    games: [],
    bios: null,
    manifest: null,
    errors: [],
    ready: null,
    profile: {},
    copies: new Map(),
    persistenceErrors: []
  };

  // Computes a lowercase SHA-256 digest without storing or uploading the supplied bytes.
  const digest = async bytes =>
    Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
      .map(v => v.toString(16).padStart(2, '0'))
      .join('');
  manager.hash = digest;

  // Fetches and caches the static catalog relative to the deployment base.
  manager.catalog = async () =>
    manager.manifest ||
    (manager.manifest = await (await fetch(new URL('data/catalog.json', NG_BASE))).json());

  // Matches either the original library filename or the selected driver archive name.
  manager.catalogGame = filename =>
    manager.manifest?.games.find(
      g => g.filename === filename || g.selected_filename === filename
    );

  // Attaches a machine-readable recovery code and details to an Error.
  manager.error = (code, details = {}) => Object.assign(Error(code), { code, details });

  // Recognizes per-role session flags, including profiles written before sessionRoles existed.
  function sessionOnly(role) {
    return Array.isArray(manager.profile.sessionRoles)
      ? manager.profile.sessionRoles.includes(role)
      : manager.profile.mode === 'session-files' && manager.profile.names?.[role];
  }

  /**
   * Restores profile metadata and prefers parent-session handles, then companion adapters.
   * Loads saved native handles only for roles not marked session-only, then rescans sources.
   */
  manager.restore = async () => {
    await manager.catalog();
    let saved;
    try {
      saved = await NGLibraryStore.get('libraryProfiles', 'default');
    } catch (e) {
      manager.persistenceErrors.push(e.message);
    }
    manager.profile = saved && typeof saved === 'object' ? saved : {};
    let session;
    try {
      session = root.parent !== root && root.parent?.NGSessionBridge?.snapshotFor(root);
    } catch {}
    const companion = await root.NGCompanion?.connect();
    for (const role of roles) {
      try {
        manager.handles[role] =
          session?.handles?.[role] ||
          companion?.[role] ||
          (!sessionOnly(role) ? await NGLibraryStore.get('handles', role) : undefined);
      } catch (e) {
        manager.errors.push(role + ': ' + e.message);
      }
    }
    return manager.scan();
  };

  // Adopts one selection and records native handles and profile metadata without requiring Save.
  manager.acceptHandle = async (role, handle) => {
    if (!roles.includes(role)) throw Error('Invalid library role');
    if (!handle) return;
    if (role !== 'bios' && handle.kind !== 'directory')
      throw Error(NGI18n.t('library_manager.select_a_directory_for_this_source'));
    manager.handles[role] = handle;
    manager.states[role] = await NGFileAccess.permission(handle);
    // Native handles are stored immediately, even when Save Library was forgotten.
    if (!handle.fallback && !handle.companion)
      try {
        await NGLibraryStore.put('handles', role, handle);
      } catch (e) {
        manager.persistenceErrors.push(role + ': ' + e.message);
      }
    const sessionRoles = new Set(manager.profile.sessionRoles || []);
    handle.fallback ? sessionRoles.add(role) : sessionRoles.delete(role);
    manager.profile = {
      ...manager.profile,
      schema: 1,
      names: { ...manager.profile.names, [role]: handle.name },
      sessionRoles: [...sessionRoles],
      mode: sessionRoles.size ? 'session-files' : 'handles',
      origin: root.location?.origin || null
    };
    try {
      await NGLibraryStore.put('libraryProfiles', 'default', manager.profile);
    } catch (e) {
      manager.persistenceErrors.push(e.message);
    }
    return handle;
  };

  // Opens the requested picker before awaiting adoption of the selected handle.
  manager.select = async (role, directory = false) =>
    manager.acceptHandle(role, await NGFileAccess.pick(role, directory));

  // Persists eligible native references and profile metadata, syncs the parent bridge, then rescans.
  manager.save = async () => {
    manager.persistenceErrors = [];
    for (const role of roles) {
      const h = manager.handles[role];
      if (h && !h.fallback && !h.companion)
        try {
          await NGLibraryStore.put('handles', role, h);
        } catch (e) {
          manager.persistenceErrors.push(role + ': ' + e.message);
        }
    }
    manager.profile = {
      schema: 1,
      names: Object.fromEntries(roles.map(r => [r, manager.handles[r]?.name || null])),
      mode: roles.some(r => manager.handles[r]?.fallback) ? 'session-files' : 'handles',
      sessionRoles: roles.filter(r => manager.handles[r]?.fallback),
      origin: root.location?.origin || null,
      savedAt: new Date().toISOString()
    };
    try {
      await NGLibraryStore.put('libraryProfiles', 'default', manager.profile);
    } catch (e) {
      manager.persistenceErrors.push(e.message);
    }
    try {
      if (root.parent !== root)
        await root.parent?.NGSessionBridge?.receiveFrom(root, manager.handles);
    } catch (e) {
      manager.persistenceErrors.push(e.message);
    }
    return manager.scan();
  };

  // Starts read-permission requests before its first await, then rescans after they settle.
  manager.reconnect = async role => {
    const pending = (role ? [role] : roles)
      .filter(r => manager.handles[r])
      .map(
        // Starts each read-permission request in the current call stack before the batch is awaited.
        r => {
          try {
            return Promise.resolve(NGFileAccess.request(manager.handles[r])).then(
              value => {
                manager.states[r] = value;
              },
              () => {
                manager.states[r] = 'denied';
              }
            );
          } catch (e) {
            manager.states[r] = 'denied';
            return Promise.resolve();
          }
        }
      );
    await Promise.all(pending);
    return manager.scan();
  };

  /**
   * Rebuilds source states, validates BIOS bytes, and indexes size-matching ROM candidates.
   * Restores optional copies and metadata; ROM-byte hashing remains the provider's responsibility.
   */
  manager.scan = async () => {
    await manager.catalog();
    manager.games = [];
    manager.bios = null;
    manager.errors = [...manager.persistenceErrors];
    for (const role of roles) {
      try {
        const h = manager.handles[role];
        manager.states[role] = h
          ? await NGFileAccess.permission(h)
          : sessionOnly(role)
            ? 'fallback-session-only'
            : 'missing';
        manager.maps[role] =
          manager.states[role] === 'granted' ? await NGFileAccess.files(h) : new Map();
      } catch (e) {
        manager.states[role] =
          e.name === 'NotFoundError'
            ? 'missing'
            : e.name === 'NotAllowedError'
              ? 'denied'
              : 'error';
        manager.maps[role] = new Map();
        manager.errors.push(role + ': ' + e.message);
      }
    }
    const biosHandle = manager.maps.bios.get('neogeo.zip');
    if (biosHandle) {
      try {
        const file = await biosHandle.getFile();
        if (
          file.size !== manager.manifest.bios.size ||
          (await digest(await file.arrayBuffer())) !== manager.manifest.bios.sha256
        )
          throw Error(
            NGI18n.t('library_manager.bios_invalid_select_the_matching_inner_neogeo')
          );
        manager.bios = { handle: biosHandle, file, status: 'VALID' };
      } catch (e) {
        manager.errors.push(e.message);
        manager.states.bios = e.name === 'NotAllowedError' ? 'prompt' : 'invalid';
      }
    } else if (manager.maps.bios.size) {
      manager.states.bios = 'invalid';
      manager.errors.push(
        NGI18n.t('library_manager.bios_invalid_extract_the_outer_package_then')
      );
    }
    try {
      const records =
        typeof NGLibraryStore.all === 'function' ? await NGLibraryStore.all('localCopies') : [];
      manager.copies = new Map(
        (records || []).filter(v => v?.schema === 1 && v.rom && v.bios).map(v => [v.gameId, v])
      );
    } catch (e) {
      manager.errors.push(
        NGI18n.t('library_manager.could_not_read_optional_copies') + ' ' + e.message
      );
    }
    for (const g of manager.manifest.games) {
      const h =
        manager.maps.roms.get(g.selected_filename.toLowerCase()) ||
        manager.maps.roms.get(g.filename.toLowerCase());
      let candidate;
      if (h)
        try {
          const size = h.sizeHint === undefined ? (await h.getFile()).size : h.sizeHint;
          if (size === g.size)
            candidate = {
              ...g,
              handle: h,
              source: h.companion ? 'local-companion' : 'local-file'
            };
        } catch (e) {
          manager.errors.push(g.filename + ': ' + e.name);
        }
      const copy = manager.copies.get(g.filename);
      if (
        !candidate &&
        copy &&
        copy.romHash === g.sha256 &&
        copy.biosHash === manager.manifest.bios.sha256 &&
        copy.rom.size === g.size
      ) {
        candidate = {
          ...g,
          handle: {
            // Returns the stored copy File without reading an external library source.
            getFile: async () => copy.rom
          },
          biosHandle: {
            // Returns the stored copy File without reading an external library source.
            getFile: async () => copy.bios
          },
          source: 'browser-copy'
        };
      }
      if (candidate)
        manager.games.push({
          ...candidate,
          screenshot: manager.maps.previews.has(g.screenshot?.toLowerCase())
            ? g.screenshot
            : null,
          availability: 'SIZE_MATCH_HASH_CHECK_AT_LAUNCH'
        });
    }
    try {
      await NGLibraryStore.put('metadata', 'index', {
        schema: 1,
        validatedAt: new Date().toISOString(),
        games: manager.games.map(({ handle, biosHandle, ...g }) => g),
        states: manager.states
      });
    } catch (e) {
      manager.errors.push(
        NGI18n.t('library_manager.could_not_save_library_metadata') + ' ' + e.message
      );
    }
    document.dispatchEvent(new Event('ng-library-changed'));
    return manager.data();
  };

  /**
   * Resolves catalog aliases and source availability or throws a specific recovery error.
   * Checks ROM sizes, including companion hints, without hashing or downloading hinted ROM bytes.
   */
  manager.resolve = async filename => {
    await manager.init();
    const g = manager.catalogGame(filename);
    if (!g) throw manager.error('ROM_FILE_NOT_IN_CATALOG', { filename });
    const available = manager.games.find(v => v.filename === g.filename);
    if (available?.source === 'browser-copy') return available;
    const state = manager.states.roms;
    if (['prompt', 'denied'].includes(state))
      throw manager.error('ROM_DIRECTORY_PERMISSION_REQUIRED', {
        state,
        expected: g.selected_filename
      });
    if (state === 'fallback-session-only')
      throw manager.error('FALLBACK_SESSION_ONLY', {
        expected: g.selected_filename,
        origin: root.location?.origin
      });
    if (state !== 'granted')
      throw manager.error('ROM_DIRECTORY_NOT_CONNECTED', {
        state,
        expected: g.selected_filename
      });
    const h =
      manager.maps.roms.get(g.selected_filename.toLowerCase()) ||
      manager.maps.roms.get(g.filename.toLowerCase());
    if (!h)
      throw manager.error('ROM_FILE_NOT_FOUND', {
        expected: g.selected_filename,
        libraryId: g.filename,
        driver: g.driver
      });
    let file;
    try {
      file = h.sizeHint !== undefined ? { size: h.sizeHint } : await h.getFile();
    } catch (e) {
      throw manager.error(
        e.name === 'NotAllowedError'
          ? 'ROM_DIRECTORY_PERMISSION_REQUIRED'
          : 'ROM_FILE_NOT_FOUND',
        { expected: g.selected_filename }
      );
    }
    if (file.size !== g.size)
      throw manager.error('ROM_SIZE_MISMATCH', {
        expected: g.selected_filename,
        expectedSize: g.size,
        actualSize: file.size,
        driver: g.driver
      });
    return { ...g, handle: h, source: h.companion ? 'local-companion' : 'local-file' };
  };

  /**
   * Stores only the supplied prepared ROM/BIOS bundle when consent is exactly true.
   * Waits for the optional-copy write before rescanning; storage failures propagate.
   */
  manager.keepGame = async (local, { consent = false } = {}) => {
    if (consent !== true) throw manager.error('LOCAL_COPY_CONSENT_REQUIRED');
    // Only this verified game and BIOS, never automatic copying of a library.
    await NGLibraryStore.put('localCopies', local.game.filename, {
      schema: 1,
      gameId: local.game.filename,
      driver: local.game.driver,
      rom: local.rom,
      bios: new File([local.bios], 'neogeo.zip', { type: 'application/zip' }),
      romHash: local.sha256,
      biosHash: local.biosSha256,
      savedAt: new Date().toISOString()
    });
    return manager.scan();
  };

  // Returns the current UI summary; engine readiness reflects the known static catalog, not a boot.
  manager.data = () => ({
    games: manager.games,
    summary: {
      games: manager.games.length,
      with_screenshots: manager.games.filter(g => g.screenshot).length,
      total_bytes: manager.games.reduce((n, g) => n + g.size, 0),
      bios_present: !!manager.bios || manager.games.some(g => g.source === 'browser-copy')
    },
    engine: {
      ready: !!manager.manifest,
      found: 1,
      total: 1,
      scope: 'PINNED_CORE_PACKAGE_FROM_VALIDATED_BUILD'
    }
  });

  // Forgets source references and resets their in-memory view without deleting optional game copies.
  manager.forget = async () => {
    await NGLibraryStore.forget();
    manager.handles = {};
    manager.maps = {};
    manager.states = {};
    manager.games = [];
    manager.bios = null;
    manager.profile = {};
    document.dispatchEvent(new Event('ng-library-changed'));
  };

  // Refreshes companion adapters when available and rescans without discarding other selections.
  manager.restoreSaved = async () => {
    const local = await root.NGCompanion?.refresh();
    if (local) {
      for (const role of roles) if (local[role]) manager.handles[role] = local[role];
    }
    return manager.scan();
  };
  root.NGLocal = manager;

  // Retry a fully empty companion listing once without touching saved source references.
  manager.init = () =>
    manager.ready ||
    (manager.ready = manager.restore()
      .then(async data => {
        const connected = roles.some(role => manager.handles[role]?.companion);
        const allEmpty = roles.every(role => !manager.maps[role]?.size);
        if (connected && allEmpty && root.NGCompanion?.available) {
          return manager.restoreSaved();
        }
        return data;
      })
      .catch(e => {
        manager.errors.push(e.message);
        return manager.data();
      }));
})(globalThis);
