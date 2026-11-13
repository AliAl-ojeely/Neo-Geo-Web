'use strict';
(function (root) {
  let frame, oldOverflow;

  // Accepts only the window belonging to the currently owned session iframe.
  function own(child) {
    return !!frame && frame.contentWindow === child;
  }

  /**
   * Accepts updates only from the owned child and rewraps fallback Files in the parent realm.
   * Retains companion adapters, clones native handles, and saves the updated parent library.
   */
  async function receiveFrom(child, handles) {
    if (!own(child)) return;
    for (const role of ['roms', 'previews', 'bios']) {
      const h = handles[role];
      if (!h) continue;
      if (h.fallback) {
        const files = [];
        const map = await NGFileAccess.files(h);
        for (const f of map.values()) {
          const file = await f.getFile();
          files.push(
            new File([file], file.name, { type: file.type, lastModified: file.lastModified })
          );
        }
        NGLocal.handles[role] = NGFileAccess.fromFiles(
          role,
          files,
          h.name,
          h.kind === 'directory'
        );
      } else if (h.companion)
        NGLocal.handles[role] = h; // virtual read-only handle must not be structuredCloned
      else NGLocal.handles[role] = structuredClone(h);
    }
    await NGLocal.save();
  }
  root.NGSessionBridge = {
    // Shares live parent-library handles only with the owned iframe window.
    snapshotFor(child) {
      return own(child) ? { handles: NGLocal.handles } : null;
    },
    receiveFrom,

    /**
     * Returns false for foreign windows; otherwise removes the iframe and restores scrolling.
     * Resolves true after rescanning the parent library without navigating it away.
     */
    async closeFor(child) {
      if (!own(child)) return false;
      frame.remove();
      frame = null;
      document.body.style.overflow = oldOverflow;
      await NGLocal.scan();
      if (typeof document.dispatchEvent === 'function' && typeof CustomEvent === 'function')
        document.dispatchEvent(new CustomEvent('ng-library-return'));
      return true;
    }
  };

  // Looks up a same-origin parent bridge without propagating cross-origin access errors.
  function parentBridge() {
    try {
      return root.parent !== root && root.parent.location.origin === location.origin
        ? root.parent.NGSessionBridge
        : null;
    } catch {
      return null;
    }
  }
  document.addEventListener(
    'click',

    // Handles parent-library returns and keeps fallback player/settings navigation inside its session.
    event => {
      const a = event.target.closest?.('a[href]');
      if (
        !a ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      const bridge = parentBridge();
      if (
        bridge &&
        (url.pathname === NG_BASE.pathname ||
          url.pathname === new URL('index.html', NG_BASE).pathname)
      ) {
        event.preventDefault();
        bridge.closeFor(root);
        return;
      }
      if (
        !document.getElementById('collection') ||
        ![
          new URL('player.html', NG_BASE).pathname,
          new URL('settings.html', NG_BASE).pathname
        ].includes(url.pathname) ||
        (!Object.values(NGLocal.handles).some(h => h?.fallback) &&
          !NGLocal.persistenceErrors.length)
      )
        return;
      event.preventDefault();
      if (frame) return;
      frame = document.createElement('iframe');
      frame.id = 'ng-session-player';
      frame.title = NGI18n.t('session_navigation.local_library_session_page');
      frame.allow = 'autoplay; fullscreen; gamepad';
      Object.assign(frame.style, {
        position: 'fixed',
        inset: '0',
        width: '100%',
        height: '100%',
        border: '0',
        zIndex: '10000',
        background: '#0b0f17'
      });
      oldOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      const opened = frame;

      // Focuses this iframe only while it remains the current session frame.
      frame.onload = () => {
        if (frame === opened) opened.contentWindow.focus();
      };
      frame.src = url.href;
      document.body.append(frame);
    }
  );
})(globalThis);
