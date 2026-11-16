/* Living Library Matrix Ambient v1.5.1: decorative, home-only, no input hooks. */
'use strict';
(function (root) {
  const doc = root.document;
  if (!doc?.body?.classList?.contains('home-page')) return;

  const COLUMN_COUNT = 10;
  const MARKS_PER_REEL = 4;
  const ID = 'ng-matrix-ambient';
  let mounted = false;

  // Build a bounded number of repeated watermark columns without timers or image requests.
  function mount() {
    if (mounted || doc.getElementById(ID)) return;
    const main = doc.querySelector('.home-main');
    if (!main) return;

    const ambient = doc.createElement('div');
    ambient.id = ID;
    ambient.className = 'ng-matrix-ambient';
    ambient.setAttribute('aria-hidden', 'true');

    for (let col = 0; col < COLUMN_COUNT; col++) {
      const column = doc.createElement('span');
      column.className = 'ng-matrix-column';
      column.style.setProperty('--ng-matrix-position', `${((col + 0.5) / COLUMN_COUNT * 100).toFixed(2)}%`);
      column.style.setProperty('--ng-matrix-duration', `${39 + ((col * 7) % 23)}s`);
      column.style.setProperty('--ng-matrix-delay', `${-((col * 13) % 47)}s`);
      column.style.setProperty('--ng-matrix-opacity', (0.065 + (col % 3) * 0.01).toFixed(3));

      const stream = doc.createElement('span');
      stream.className = 'ng-matrix-stream';
      for (let repeat = 0; repeat < 2; repeat++) {
        const reel = doc.createElement('span');
        reel.className = 'ng-matrix-reel';
        for (let mark = 0; mark < MARKS_PER_REEL; mark++) {
          const logo = doc.createElement('span');
          logo.className = 'ng-matrix-mark';
          logo.style.setProperty('--ng-matrix-tilt', `${-19 + ((col + mark) % 4) * 3}deg`);
          logo.style.setProperty('--ng-matrix-scale', (0.79 + ((col * 3 + mark) % 4) * 0.09).toFixed(2));
          reel.appendChild(logo);
        }
        stream.appendChild(reel);
      }
      column.appendChild(stream);
      ambient.appendChild(column);
    }

    const watermark = doc.createElement('span');
    watermark.className = 'ng-matrix-watermark';
    ambient.appendChild(watermark);
    main.insertBefore(ambient, main.firstChild);
    doc.body.classList.add('ng-matrix-enabled');
    mounted = true;
    updateVisibility();
  }

  // Pause while the document is hidden; the existing motion toggle is CSS-driven.
  function updateVisibility() {
    const ambient = doc.getElementById(ID);
    if (ambient) ambient.classList.toggle('ng-matrix-paused', Boolean(doc.hidden));
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
  doc.addEventListener('visibilitychange', updateVisibility);
  root.addEventListener?.('pagehide', () => doc.getElementById(ID)?.classList.add('ng-matrix-paused'));
  root.addEventListener?.('pageshow', updateVisibility);

  root.NGLibraryMatrix = Object.freeze({ mount, updateVisibility, version: '1.5.1' });
})(window);
