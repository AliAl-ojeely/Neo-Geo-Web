/* Player-only, opt-in browser frame-pacing monitor. Does not modify EmulatorJS. */
'use strict';
(function (root) {
  const doc = root.document;
  let session = null;
  const t = key => root.NGI18n?.t('performance_monitor.' + key) || key;
  const now = () => root.performance.now();
  // Neo Geo MVS nominal video refresh rate; an approximation, not an emulator clock setting.
  const NOMINAL_NEO_GEO_HZ = 59.18;
  const SIZES = Object.freeze(['full', 'medium', 'small']);
  const POSITIONS = Object.freeze([
    'top-left', 'top-center', 'top-right',
    'middle-left', 'middle-right',
    'bottom-left', 'bottom-center', 'bottom-right'
  ]);

  // Ignore unexpected saved values rather than creating arbitrary CSS classes or positions.
  function layout(options) {
    return {
      size: SIZES.includes(options.size) ? options.size : 'full',
      position: POSITIONS.includes(options.position) ? options.position : 'top-right'
    };
  }

  // Build a small noninteractive HUD inside the element EmulatorJS fullscreens.
  function build(host, display) {
    const hud = doc.createElement('aside');
    hud.id = 'ng-performance-hud';
    hud.className = 'ng-performance-hud';
    hud.setAttribute('data-ng-size', display.size);
    hud.setAttribute('data-ng-position', display.position);
    hud.setAttribute('aria-label', t('title'));
    hud.setAttribute('aria-live', 'off');
    const title = doc.createElement('div');
    title.className = 'ng-performance-heading';
    const heading = doc.createElement('strong');
    const mode = doc.createElement('span');
    title.append(heading, mode);
    hud.append(title);
    const metrics = doc.createElement('div');
    metrics.className = 'ng-performance-metrics';
    const cells = {};
    for (const key of ['fps', 'frame', 'memory', 'session', 'gameFps', 'emulationSpeed']) {
      const cell = doc.createElement('div');
      cell.className = 'ng-performance-cell';
      cell.setAttribute('data-ng-metric', key);
      const label = doc.createElement('span');
      label.className = 'ng-performance-label';
      const value = doc.createElement('strong');
      value.className = 'ng-performance-value';
      value.textContent = '--';
      cell.append(label, value);
      metrics.append(cell);
      cells[key] = { label, value };
    }
    hud.append(metrics);
    const chartBox = doc.createElement('div');
    chartBox.className = 'ng-performance-chart';
    const chartLabel = doc.createElement('span');
    chartLabel.className = 'ng-performance-chart-label';
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 300 36');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('preserveAspectRatio', 'none');
    const line = doc.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    line.setAttribute('class', 'ng-performance-spark');
    line.setAttribute('points', '');
    svg.append(line);
    chartBox.append(chartLabel, svg);
    hud.append(chartBox);
    const note = doc.createElement('span');
    note.className = 'ng-performance-note';
    hud.append(note);
    host.append(hud);
    return { hud, heading, mode, cells, chartLabel, line, note };
  }

  function translate(s) {
    const v = s.ui;
    v.hud.setAttribute('aria-label', t('title'));
    v.heading.textContent = t('title');
    v.mode.textContent = t('browser_measurement');
    for (const key of Object.keys(v.cells)) v.cells[key].label.textContent = t(key);
    v.chartLabel.textContent = t('chart');
    v.note.textContent = t('limitations');
    if (s.exportButton) s.exportButton.textContent = t('export');
  }

  // Approximate JS heap size only when the browser exposes it; never label it as WASM RAM.
  function heapMB() {
    const size = root.performance?.memory?.usedJSHeapSize;
    return Number.isFinite(size) && size >= 0 ? Math.round(size / 1048576) : null;
  }

  function formatTime(milliseconds) {
    const secs = Math.max(0, Math.floor(milliseconds / 1000));
    return String(Math.floor(secs / 3600)).padStart(2, '0') + ':' +
      String(Math.floor(secs % 3600 / 60)).padStart(2, '0') + ':' +
      String(secs % 60).padStart(2, '0');
  }

  function draw(s) {
    const v = s.ui;
    const sample = s.latest;
    v.cells.fps.value.textContent = sample?.fps == null ? '--' : String(sample.fps);
    v.cells.frame.value.textContent = sample?.frameMs == null ? '--' : sample.frameMs.toFixed(1) + ' ms';
    v.cells.memory.value.textContent = sample?.heapMB == null ? t('unavailable') : sample.heapMB + ' MB';
    v.cells.session.value.textContent = formatTime(s.activeMs);
    v.cells.gameFps.value.textContent = sample?.gameFps == null ? t('unavailable') : sample.gameFps.toFixed(1);
    v.cells.emulationSpeed.value.textContent = sample?.emulationSpeedPercent == null
      ? t('unavailable') : sample.emulationSpeedPercent.toFixed(1) + '%';
    // Compact layouts do not paint the hidden graph; all samples remain exportable.
    if (s.size !== 'full') return;
    const values = s.samples.map(x => x.frameMs).filter(Number.isFinite);
    if (values.length < 2) {
      v.line.setAttribute('points', '');
      return;
    }
    const max = Math.max(34, ...values.map(x => Math.min(x, 100)));
    const points = values.map((value, i) => {
      const x = i * 300 / Math.max(1, values.length - 1);
      const y = 33 - Math.min(value, max) / max * 30;
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    v.line.setAttribute('points', points);
  }

  // Read the core's executed-frame counter without modifying, wrapping or replacing vendor methods.
  function coreFrameCount(s) {
    try {
      const manager = s.emulator?.gameManager;
      const value = manager?.getFrameNum?.();
      return Number.isSafeInteger(value) && value >= 0 ? value : null;
    } catch (_) {
      return null;
    }
  }

  // Compute actual core-frame throughput from two monotonic samples, never from browser RAF FPS.
  function sampleCore(s, timestamp, active) {
    if (!active) {
      s.coreBaseline = null;
      return { gameFps: null, emulationSpeedPercent: null };
    }
    const count = coreFrameCount(s);
    if (count === null) {
      s.coreBaseline = null;
      return { gameFps: null, emulationSpeedPercent: null };
    }
    const previous = s.coreBaseline;
    s.coreBaseline = { count, timestamp };
    if (!previous || timestamp <= previous.timestamp || count < previous.count)
      return { gameFps: null, emulationSpeedPercent: null };
    const elapsed = (timestamp - previous.timestamp) / 1000;
    const delta = count - previous.count;
    // Reject non-contiguous or impossible counts, including resets, save/load jumps and stale tabs.
    if (elapsed < 0.75 || elapsed > 5 || delta > elapsed * 300)
      return { gameFps: null, emulationSpeedPercent: null };
    const fps = delta / elapsed;
    return {
      gameFps: Math.round(fps * 10) / 10,
      emulationSpeedPercent: Math.round(fps / NOMINAL_NEO_GEO_HZ * 1000) / 10
    };
  }

  // Sample requestAnimationFrame scheduling (NOT FBNeo emulation FPS) once per second.
  function tick(timestamp) {
    const s = session;
    if (!s) return;
    const visible = doc.visibilityState !== 'hidden';
    const paused = !!s.emulator.paused;
    if (visible && !paused && s.lastFrameAt !== null) {
      const delta = timestamp - s.lastFrameAt;
      if (delta > 0 && delta < 250) {
        s.frames++;
        s.frameTotal += delta;
        s.activeMs += delta;
      }
    }
    s.lastFrameAt = visible && !paused ? timestamp : null;
    if (!visible || paused) s.coreBaseline = null;
    if (timestamp - s.lastSampleAt >= 1000) {
      const span = timestamp - s.lastSampleAt;
      const active = visible && !paused;
      const core = sampleCore(s, timestamp, active);
      const sample = {
        ...core,
        atSeconds: Math.round((timestamp - s.startedAt) / 1000),
        fps: active && s.frames ? Math.round(s.frames * 1000 / span) : null,
        frameMs: active && s.frames ? Math.round(s.frameTotal / s.frames * 10) / 10 : null,
        heapMB: heapMB(),
        paused: !active
      };
      s.samples.push(sample);
      if (s.samples.length > 30) s.samples.shift();
      s.latest = sample;
      s.frames = 0;
      s.frameTotal = 0;
      s.lastSampleAt = timestamp;
      draw(s);
    }
    s.raf = root.requestAnimationFrame(tick);
  }

  // Keep a bounded private report without file paths, ROM bytes or BIOS data.
  function report() {
    const s = session;
    if (!s) return null;
    return {
      schema: 'neogeo-performance-v2',
      nominalNeoGeoHz: NOMINAL_NEO_GEO_HZ,
      metrics: {
        fps: 'requestAnimationFrame callback cadence; not FBNeo core FPS',
        gameFps: 'delta of EmulatorJS gameManager.getFrameNum() / elapsed seconds; executed emulation frames, not unique screen frames',
        emulationSpeedPercent: 'approximate ratio of executed emulation frames per second to nominal Neo Geo 59.18 Hz; not game-internal animation speed',
        frameMs: 'mean callback interval; not game render duration',
        heapMB: 'performance.memory usedJSHeapSize; may be unavailable and excludes WASM RAM',
        session: 'approximate visible, unpaused time'
      },
      activeSeconds: Math.floor(s.activeMs / 1000),
      display: { size: s.size, position: s.position },
      samples: s.samples.map(x => ({ ...x }))
    };
  }

  function exportReport() {
    const data = report();
    if (!data) return false;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = root.URL.createObjectURL(blob);
    const a = doc.createElement('a');
    a.href = url;
    a.download = 'neo-geo-performance.json';
    a.click();
    root.setTimeout(() => root.URL.revokeObjectURL(url), 1000);
    return true;
  }

  function stop() {
    const s = session;
    if (!s) return;
    session = null;
    if (s.raf !== null) root.cancelAnimationFrame(s.raf);
    s.ui.hud.remove();
    s.exportButton?.remove();
  }

  function start(emulator, options = {}) {
    stop();
    if (!options.enabled || !emulator?.started ||
        !emulator.elements?.parent?.append ||
        typeof root.requestAnimationFrame !== 'function') return false;
    const host = emulator.elements.parent;
    const display = layout(options);
    const startedAt = now();
    const s = {
      emulator, ui: build(host, display), size: display.size, position: display.position,
      startedAt, lastFrameAt: null,
      lastSampleAt: startedAt, activeMs: 0, frames: 0,
      frameTotal: 0, samples: [], latest: null, raf: null, exportButton: null,
      coreBaseline: null
    };
    session = s;
    const bar = doc.querySelector('.diagnostics-actions-bar');
    if (bar) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.id = 'ng-export-performance';
      button.addEventListener('click', exportReport);
      bar.append(button);
      s.exportButton = button;
    }
    translate(s);
    draw(s);
    s.raf = root.requestAnimationFrame(tick);
    return true;
  }

  doc.addEventListener('ng-language-changed', () => { if (session) translate(session); });
  doc.addEventListener('visibilitychange', () => {
    if (session) { session.lastFrameAt = null; session.coreBaseline = null; }
  });
  root.addEventListener('pagehide', stop);
  root.NGPerformanceMonitor = Object.freeze({ start, stop, report, exportReport });
})(window);
