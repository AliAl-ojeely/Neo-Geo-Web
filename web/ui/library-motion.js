/* Lightweight library entrance effects: rise, side slide and soft scale. */
'use strict';
(function (root) {
  const doc = root.document;
  const reduce = root.matchMedia?.('(prefers-reduced-motion: reduce)');
  let observer = null;
  let lastReveal = [];
  const types = ['rise', 'side', 'scale'];

  // Make the entrance visible after the startup cover, not behind it.
  function enterPage() {
    if (doc.documentElement.classList.contains('ng-startup-pending')) return;
    const selectors = ['.hero-editorial', '.quick-stats', '.collection-heading', '.collection-controls-bar'];
    selectors.forEach((selector, index) => {
      const el = doc.querySelector(selector);
      if (!el) return;
      el.classList.remove('ng-page-arrive');
      el.style.setProperty('--ng-page-delay', `${index * 90}ms`);
      if (reduce?.matches) return;
      // A synchronous style flush permits the same animation when returning from a game.
      void el.offsetWidth;
      el.classList.add('ng-page-arrive');
    });
    if (lastReveal.length) reveal(lastReveal, true);
  }

  // Animate only cards entering the viewport and disconnect observers for replaced cards.
  function reveal(cards, replace = true) {
    const elements = Array.from(cards || []);
    if (replace) {
      observer?.disconnect();
      observer = null;
      lastReveal = elements;
    } else {
      lastReveal = [...lastReveal, ...elements];
    }
    if (!elements.length) return;
    elements.forEach((el, index) => {
      el.classList.remove('ng-card-seen');
      el.classList.add('ng-card-motion');
      el.dataset.ngMotion = types[index % types.length];
      el.style.setProperty('--ng-card-delay', `${(index % 6) * 55}ms`);
    });
    if (reduce?.matches || !('IntersectionObserver' in root)) {
      elements.forEach(el => el.classList.add('ng-card-seen'));
      return;
    }
    if (!observer) {
      observer = new root.IntersectionObserver(entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('ng-card-seen');
          observer.unobserve(entry.target);
        }
      }, { threshold: 0.05, rootMargin: '0px 0px 70px 0px' });
    }
    elements.forEach(el => observer.observe(el));
  }

  doc.addEventListener('ng-startup-finished', enterPage);
  doc.addEventListener('ng-library-return', enterPage);
  root.addEventListener('pagehide', () => observer?.disconnect());
  if (doc.readyState === 'loading')
    doc.addEventListener('DOMContentLoaded', enterPage, { once: true });
  else enterPage();

  root.NGLibraryMotion = Object.freeze({ reveal, enterPage });
})(window);
