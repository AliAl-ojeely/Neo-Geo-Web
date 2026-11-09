'use strict';
(function (root) {
  const referenceStores = ['handles', 'libraryProfiles', 'metadata', 'settings'];
  const stores = [...referenceStores, 'localCopies'];
  let opening;

  // Shares the pending database open and installs schema-upgrade and connection-lifecycle handlers.
  const open = () =>
    opening ||
    (opening = new Promise((resolve, reject) => {
      const req = indexedDB.open('neogeo-web-library-db', 2);

      // Adds missing stores without deleting existing references, settings, or optional copies.
      req.onupgradeneeded = () => {
        for (const name of stores)
          if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name);
      };

      // Resolves the opened connection and closes it when another context changes its version.
      req.onsuccess = () => {
        req.result.onversionchange = () => {
          req.result.close();
          opening = null;
        };
        resolve(req.result);
      };
      req.onerror = () => {
        opening = null;
        reject(req.error);
      };

      // Rejects a blocked open and clears the cached promise so a later call can retry.
      req.onblocked = () => {
        opening = null;
        reject(Error(NGI18n.t('indexeddb_store.close_older_library_tabs_to_update_storage')));
      };
    }));

  /**
   * Runs a readonly lookup or a readwrite mutation in the requested store.
   * Resolves the request result only after transaction completion; aborts and errors reject.
   */
  async function action(store, method, key, value) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(
          store,
          ['get', 'getAll'].includes(method) ? 'readonly' : 'readwrite'
        ),
        s = tx.objectStore(store);
      let result;
      const request = method === 'put' ? s.put(value, key) : s[method](key);
      request.onsuccess = () => {
        result = request.result;
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = tx.onerror = () =>
        reject(
          tx.error ||
            request.error ||
            Error(NGI18n.t('indexeddb_store.could_not_store_library_references'))
        );
    });
  }
  root.NGLibraryStore = {
    open,

    // Reads one record using the transaction-completion contract of action.
    get: (s, k) => action(s, 'get', k),

    // Reads all records without starting a readwrite transaction.
    all: s => action(s, 'getAll'),

    // Stores a record under its explicit key and waits for transaction completion.
    put: (s, k, v) => action(s, 'put', k, v),

    // Deletes only the specified key from the requested store.
    remove: (s, k) => action(s, 'delete', k),

    // Clears reference stores in one transaction while preserving localCopies and game-save databases.
    async forget() {
      const db = await open();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(referenceStores, 'readwrite');
        for (const s of referenceStores) tx.objectStore(s).clear();
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    }
  };
})(globalThis);
