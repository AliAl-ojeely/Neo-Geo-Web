'use strict';
(function (root) {
  const urls = new Map();
  let generation = 0;
  const observer =
    typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(
          // Unobserves each visible image before starting its asynchronous preview load.
          entries => {
            for (const e of entries)
              if (e.isIntersecting) {
                observer.unobserve(e.target);
                load(e.target);
              }
          }
        )
      : null;

  // Loads a supported image on demand, discarding stale or detached results before creating its URL.
  async function load(img) {
    const token = generation;
    try {
      const name = img.dataset.preview;
      if (!name) return;
      const handle = NGLocal.maps.previews?.get(name.toLowerCase());
      if (!handle) throw Error('Preview missing');
      const file = await handle.getFile();
      if (token !== generation || !img.isConnected) return;
      if (!/\.(bmp|png|jpe?g)$/i.test(file.name)) throw Error('Unsupported image');
      if (!urls.has(name)) urls.set(name, URL.createObjectURL(file));
      img.src = urls.get(name);
    } catch {
      img.dispatchEvent(new Event('error'));
    }
  }
  const api = {
    // Associates a preview name with an image and waits for intersection when that API exists.
    attach(img, name) {
      img.dataset.preview = name;
      if (observer) observer.observe(img);
      else load(img);
    },

    // Invalidates pending loads, disconnects observation, and revokes every cached object URL.
    clear() {
      generation++;
      observer?.disconnect();
      for (const u of urls.values()) URL.revokeObjectURL(u);
      urls.clear();
    },

    // Reports the number of cached preview URLs, not the number of rendered images.
    get count() {
      return urls.size;
    }
  };
  root.NGPreviews = api;
  addEventListener('pagehide', api.clear);
})(globalThis);
