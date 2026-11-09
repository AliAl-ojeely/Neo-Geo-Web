/* Neo Geo Web Emu — visual extras only. No ROM, BIOS, save or input hooks. */
'use strict';
(() => {
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

  // Respects the reduced-motion preference for programmatic scrolling.
  const smooth = () => (reducedMotion?.matches ? 'auto' : 'smooth');

  // Wires scroll feedback, entrance effects, and the first-run guide once the DOM is ready.
  const ready = () => {
    const topButtons = [...document.querySelectorAll('[data-scroll-top]')];

    // Synchronizes back-to-top visibility, accessibility state, and keyboard reachability.
    const updateTopButtons = () => {
      const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
      const visible = scrollY > Math.max(240, window.innerHeight * 0.38);
      for (const button of topButtons) {
        button.classList.toggle('is-visible', visible);
        button.setAttribute('aria-hidden', String(!visible));
        button.tabIndex = visible ? 0 : -1;
      }
    };

    let topTicking = false;

    // Coalesces scroll and resize notifications into one update per animation frame.
    const queueTopUpdate = () => {
      if (topTicking) return;
      topTicking = true;
      window.requestAnimationFrame(() => {
        topTicking = false;
        updateTopButtons();
      });
    };

    for (const button of topButtons) {
      button.addEventListener('click', () => window.scrollTo({ top: 0, behavior: smooth() }));
    }
    window.addEventListener('scroll', queueTopUpdate, { passive: true });
    window.addEventListener('resize', queueTopUpdate);
    updateTopButtons();

    if ('IntersectionObserver' in window && !reducedMotion?.matches) {
      const targets = document.querySelectorAll(
        '.hero-editorial, .quick-stats, .collection-heading, .collection-controls-bar, .collection-toolbar, .game-grid, .settings-intro, .settings-shell, .player-hud-header, .theater-backdrop'
      );
      // Marks each intersecting section once, then stops observing it.
      const observer = new IntersectionObserver(
        entries => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              entry.target.classList.add('is-in-view');
              observer.unobserve(entry.target);
            }
          }
        },
        { threshold: 0.05, rootMargin: '0px 0px -20px 0px' }
      );
      for (const target of targets) {
        target.classList.add('subtle-entrance');
        observer.observe(target);
      }
    }

    const guide = document.getElementById('first-run-guide');
    if (!guide) return;

    const key = 'neogeo-web-welcome-v3';
    const firstButton = guide.querySelector('[data-guide-setup]');
    const backdrop = guide.querySelector('.first-run-backdrop');
    let previousFocus = null;

    // Treats unavailable localStorage as an unacknowledged welcome guide.
    const getRemembered = () => {
      try {
        return localStorage.getItem(key) === 'acknowledged';
      } catch {
        return false;
      }
    };

    // Records acknowledgement without blocking dismissal when storage is unavailable.
    const markRemembered = () => {
      try {
        localStorage.setItem(key, 'acknowledged');
      } catch {}
    };

    // Opens a hidden guide, remembers prior focus, and focuses its setup button.
    function showGuide() {
      if (!guide.hidden) return;
      previousFocus = document.activeElement;
      guide.hidden = false;
      document.body.classList.add('guide-open');
      requestAnimationFrame(() => guide.classList.add('is-open'));
      firstButton?.focus({ preventScroll: true });
    }

    // Acknowledges and hides the guide, then reveals the library or restores prior focus.
    function closeGuide(openLibrary) {
      markRemembered();
      guide.classList.remove('is-open');
      guide.hidden = true;
      document.body.classList.remove('guide-open');
      if (openLibrary) {
        const library = document.getElementById('local-library');
        if (library) library.open = true;
        const target = library || document.getElementById('collection');
        target?.scrollIntoView({ behavior: smooth(), block: 'start' });
      } else if (previousFocus?.isConnected && previousFocus.focus) {
        previousFocus.focus({ preventScroll: true });
      }
    }

    guide
      .querySelectorAll('[data-guide-dismiss]')
      .forEach(button => button.addEventListener('click', () => closeGuide(false)));
    backdrop?.addEventListener('click', () => closeGuide(false));
    firstButton?.addEventListener('click', () => closeGuide(true));

    // Handles Escape and wraps Tab focus among the guide's visible interactive elements.
    guide.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeGuide(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const nodes = [...guide.querySelectorAll('button:not([disabled]), a[href]')].filter(
        n => n.getClientRects().length > 0
      );
      if (!nodes.length) return;
      if (event.shiftKey && document.activeElement === nodes[0]) {
        event.preventDefault();
        nodes.at(-1).focus();
      } else if (!event.shiftKey && document.activeElement === nodes.at(-1)) {
        event.preventDefault();
        nodes[0].focus();
      }
    });

    const query = new URLSearchParams(location.search);
    if (query.has('guide') || !getRemembered()) showGuide();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready, { once: true });
  } else {
    ready();
  }
})();
