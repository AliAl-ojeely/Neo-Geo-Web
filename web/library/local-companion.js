/* Optional loopback-only local library companion. No requests from public origins. */
'use strict';
(function (root) {
  const roles = ['roms', 'previews', 'bios'];
  const api = { available: false, ready: null, handles: {}, status: null, error: null };

  // Limits companion discovery to localhost and the explicit IPv4 loopback hostname.
  const localOrigin = () =>
    root.location && ['127.0.0.1', 'localhost'].includes(root.location.hostname);

  // Resolves a companion API path under the current application base.
  const endpoint = path => new URL('__ng_local__/' + path, root.NG_BASE);

  // Fetches uncached same-origin companion JSON and rejects non-success HTTP responses.
  const get = async path => {
    const response = await fetch(endpoint(path), {
      cache: 'no-store',
      credentials: 'same-origin'
    });
    if (!response.ok) throw new Error('Local companion HTTP ' + response.status);
    return response.json();
  };

  // Filters listing names to safe leaf entries before building file endpoints.
  const valid = name =>
    typeof name === 'string' &&
    name.length < 200 &&
    !/[\\/\x00]/.test(name) &&
    name !== '.' &&
    name !== '..';

  // Builds a virtual file adapter with a size hint so indexing need not download its contents.
  function fileEntry(role, item) {
    const name = item.name,
      sizeHint = item.size;
    return {
      kind: 'file',
      name,
      sizeHint,
      companion: true,

      // Downloads this companion file on demand and wraps the response as a browser File.
      async getFile() {
        const response = await fetch(
          endpoint('file/' + role + '/' + encodeURIComponent(name)),
          { cache: 'no-store', credentials: 'same-origin' }
        );
        if (!response.ok)
          throw new Error(
            NGI18n.t('local_companion.could_not_read_the_file_from_the') + ' ' + response.status
          );
        return new File([await response.blob()], name, {
          type: role === 'previews' ? 'image/bmp' : 'application/zip'
        });
      }
    };
  }

  /**
   * Discovers configured roles only on loopback origins with a recognized companion schema.
   * Returns virtual directory adapters, recording request errors instead of throwing them.
   */
  async function connect() {
    if (!localOrigin()) return null;
    try {
      const status = await get('status');
      if (status?.service !== 'neogeo-local-companion' || status?.schema !== 1) {
        api.available = false;
        api.handles = {};
        api.status = null;
        api.error = null;
        return null;
      }
      const handles = {};
      for (const role of roles) {
        if (!status.roles?.[role]?.configured) continue;
        const listing = await get('list/' + role);
        const entries = (listing.files || [])
          .filter(x => valid(x.name) && Number.isSafeInteger(x.size) && x.size >= 0)
          .map(x => [x.name, fileEntry(role, x)]);
        handles[role] = {
          kind: 'directory',
          name: status.roles[role].label || role,
          companion: true,

          // Yields the validated listing snapshot without another HTTP request.
          async *entries() {
            for (const entry of entries) yield entry;
          }
        };
      }
      api.handles = handles;
      api.status = status;
      api.available = true;
      api.error = null;
      return handles;
    } catch (e) {
      api.available = false;
      api.error = e.message;
      api.handles = {};
      api.status = null;
      return null;
    }
  }

  // Shares the discovery promise, including a null result, until an explicit refresh.
  api.connect = () => api.ready || (api.ready = connect());

  // Drops the discovery promise so the next connection attempt queries the companion again.
  api.refresh = () => {
    api.ready = null;
    return api.connect();
  };
  root.NGCompanion = api;
})(globalThis);
