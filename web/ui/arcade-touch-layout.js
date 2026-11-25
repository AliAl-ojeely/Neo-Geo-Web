'use strict';
(function () {
  const key = 'neogeo-touch-layout-v1';
  const defaults = { joystick: 100, action: 100, auxiliary: 100, spacing: 4, opacity: 100, position: 'center' };
  function normalize(raw) {
    const result = { ...defaults };
    for (const [id, min, max] of [['joystick',80,120],['action',85,120],['auxiliary',85,120],['spacing',2,12],['opacity',45,100]]) {
      const value = raw?.[id];
      if ((typeof value === 'string' && value.trim() || typeof value === 'number') && Number.isFinite(Number(value)))
        result[id] = Math.max(min, Math.min(max, Number(value)));
    }
    if (['center','higher','lower'].includes(raw?.position)) result.position = raw.position;
    return result;
  }

  // A hybrid PC stays in desktop mode until its player opts in.
  function prefersTouch({ points, userAgent, coarse, hover, fine }) {
    if (!points || /Windows|CrOS/i.test(userAgent)) return false;
    if (/Android|iPhone|iPad|iPod/i.test(userAgent)) return true;
    return coarse && !hover && !fine;
  }

  // Requests fullscreen synchronously in the initiating gesture, then attempts the optional lock.
  function orientationSession(game, doc, screen) {
    let generation = 0, locked = false;
    const active = () => (doc.fullscreenElement || doc.webkitFullscreenElement) === game;
    function release() {
      generation++;
      if (!locked) return;
      locked = false;
      try { screen.orientation?.unlock?.(); } catch (_) {}
    }
    async function enter() {
      const token = ++generation;
      try {
        if (!active()) {
          const request = game.requestFullscreen || game.webkitRequestFullscreen;
          if (!request) return false;
          await request.call(game);
        }
        if (!active() || token !== generation || !screen.orientation?.lock) return false;
        await screen.orientation.lock('landscape');
        if (token !== generation || !active()) {
          // A delayed lock can finish after the fullscreen session has already ended.
          if (!active() && !locked) screen.orientation.unlock?.();
          return false;
        }
        locked = true;
        return true;
      } catch (_) { return false; }
    }
    async function exit() {
      release();
      if (active()) {
        try { await (doc.exitFullscreen || doc.webkitExitFullscreen)?.call(doc); } catch (_) {}
      }
    }
    return { enter, exit, release, active };
  }

  // Port selection wraps only the vendor's touch event stack and its deferred input releases.
  function touchRouter(send) {
    let port = 0, epoch = 0, context = null;
    const held = new Set();
    function run(token, callback) {
      const previous = context;
      context = token;
      try { return callback(); } finally { context = previous; }
    }
    function dispatch(player, id, value) {
      if (!context || player !== 0 || !(id >= 0 && id <= 15 || [27,28,29].includes(id))) return send(player, id, value);
      if (context.epoch !== epoch) return;
      if (value) held.add(id);
      else held.delete(id);
      return send(id <= 15 ? context.port : 0, id, value);
    }
    function release() {
      epoch++;
      for (const id of held) send(id <= 15 ? port : 0, id, 0);
      held.clear();
    }
    return {
      dispatch, release, run,
      snapshot: () => ({ port, epoch }),
      select(next) { if (next === port) return; release(); port = next; }
    };
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = { normalize, prefersTouch, orientationSession, touchRouter };
    return;
  }
  const game = document.getElementById('game');
  if (!game) return;
  const portrait = matchMedia('(orientation: portrait)');
  const touch = navigator.maxTouchPoints > 0;
  const automatic = prefersTouch({
    points: navigator.maxTouchPoints,
    userAgent: navigator.userAgent,
    coarse: matchMedia('(pointer: coarse)').matches,
    hover: matchMedia('(any-hover: hover)').matches,
    fine: matchMedia('(any-pointer: fine)').matches
  });
  const modeButton = document.getElementById('ng-player-touch-mode');
  let touchMode = automatic;
  const session = orientationSession(game, document, screen);
  const listeners = new AbortController();
  const options = { signal: listeners.signal };
  const touches = new Map(), pointers = new Map();
  let prefs = defaults, tools, panel, note, started = false, failed = false;
  let resizeFrame = 0, router, selected = 0;
  const scopes = new WeakMap();
  const cancelledFingers = new Set();
  try { prefs = normalize(JSON.parse(localStorage.getItem(key))); } catch (_) {}

  function refreshGeometry() {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      const deck = game.querySelector('.ejs_virtualGamepad_parent');
      if (touchMode && portrait.matches && deck?.offsetHeight) {
        const height = deck.offsetHeight + 'px';
        if (game.style.getPropertyValue('--touch-deck-height') !== height)
          game.style.setProperty('--touch-deck-height', height);
      }
      // EmulatorJS and its stick recalculate their own positions through the existing resize event.
      if (deck?.offsetHeight)
        window.dispatchEvent(new Event('resize'));
    });
  }

  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(refreshGeometry) : null;
  observer?.observe(game);

  const padTarget = target => target.closest?.('.ejs_virtualGamepad_button, .b_dpad, .ejs_dpad_main');
  if (touch) {
    // EmulatorJS uses short timers for button release and neutral stick directions.
    // Bind only timers scheduled during this dispatch to the same player snapshot.
    for (const type of ['touchstart','touchend','touchcancel','pointerdown','pointermove','pointerup','pointercancel']) {
      window.addEventListener(type, event => {
        if (!touchMode || !router || !(padTarget(event.target) || pointers.has(event.pointerId))) return;
        if (event.isTrusted && event.changedTouches?.length) {
          const fingers = Array.from(event.changedTouches);
          if (type === 'touchstart') for (const finger of fingers) cancelledFingers.delete(finger.identifier);
          else {
            const cancelled = fingers.every(finger => cancelledFingers.has(finger.identifier));
            for (const finger of fingers) cancelledFingers.delete(finger.identifier);
            if (cancelled) {
              event.stopImmediatePropagation();
              return;
            }
          }
        }
        const token = router.snapshot(), original = window.setTimeout;
        const schedule = (callback, delay, ...args) => {
          if (typeof callback !== 'function' || window.event !== event || (delay != null && delay !== 0 && delay !== 30))
            return original.call(window, callback, delay, ...args);
          return original.call(window, () => router.run(token, () => callback(...args)), delay);
        };
        scopes.set(event, token);
        window.setTimeout = schedule;
        const restore = () => { if (window.setTimeout === schedule) window.setTimeout = original; };
        window.addEventListener(type, restore, { once: true });
        original.call(window, () => { restore(); window.removeEventListener(type, restore); }, 0);
      }, { ...options, capture: true });
    }
    game.addEventListener('touchstart', event => {
      for (const finger of event.changedTouches) {
        const target = padTarget(finger.target);
        if (target) touches.set(finger.identifier, { target, finger });
      }
    }, { ...options, capture: true, passive: true });
    for (const type of ['touchend','touchcancel']) window.addEventListener(type, event => {
      for (const finger of event.changedTouches || []) touches.delete(finger.identifier);
    }, { ...options, capture: true, passive: true });
    game.addEventListener('pointerdown', event => {
      const target = padTarget(event.target);
      if (target && event.pointerType === 'touch') pointers.set(event.pointerId, target);
    }, { ...options, capture: true });
    game.addEventListener('pointermove', event => {
      const zone = pointers.get(event.pointerId);
      if (!zone?.matches('.b_dpad,.ejs_dpad_main')) return;
      const rect = zone.getBoundingClientRect();
      const x = event.clientX - (rect.left + rect.width / 2);
      const y = event.clientY - (rect.top + rect.height / 2);
      if (Math.hypot(x, y) < 6) delete zone.dataset.touchDirection;
      else zone.dataset.touchDirection = Math.abs(x) > Math.abs(y)
        ? (x > 0 ? 'right' : 'left') : (y > 0 ? 'down' : 'up');
    }, { ...options, capture: true, passive: true });
    for (const type of ['pointerup','pointercancel', 'lostpointercapture'])
      window.addEventListener(type, event => {
        const target = pointers.get(event.pointerId);
        if (target) delete target.dataset.touchDirection;
        pointers.delete(event.pointerId);
      }, { ...options, capture: true });
  }

  function releaseTouches() {
    for (const [id, target] of pointers) {
      if (typeof PointerEvent === 'function')
        target.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch' }));
    }
    for (const { target, finger } of touches.values()) {
      cancelledFingers.add(finger.identifier);
      const options = { bubbles: true, cancelable: true };
      const cancel = typeof TouchEvent === 'function'
        ? new TouchEvent('touchcancel', { ...options, changedTouches: [finger] })
        : new Event('touchcancel', options);
      target.dispatchEvent(cancel);
    }
    pointers.clear();
    touches.clear();
    router?.release();
  }

  function apply(next, persist = false) {
    prefs = normalize(next);
    game.style.setProperty('--touch-action-scale', prefs.action / 100);
    game.style.setProperty('--touch-aux-scale', prefs.auxiliary / 100);
    game.style.setProperty('--touch-stick-scale', prefs.joystick / 100);
    game.style.setProperty('--touch-gap-pref', prefs.spacing + 'px');
    game.style.setProperty('--touch-opacity', prefs.opacity / 100);
    game.dataset.touchPosition = prefs.position;
    if (panel) for (const [id, value] of Object.entries(prefs)) {
      panel.elements[id].value = value;
      const output = panel.querySelector(`[data-touch-value="${id}"]`);
      if (output) output.value = value + output.dataset.unit;
    }
    if (persist) try { localStorage.setItem(key, JSON.stringify(prefs)); } catch (_) {}
    refreshGeometry();
  }

  // The general translator intentionally skips EmulatorJS's root.
  function translateTools() {
    if (!tools || !window.NGI18n) return;
    const start = game.querySelector('.ejs_virtualGamepad_bottom .b_start');
    const coin = game.querySelector('.ejs_virtualGamepad_bottom .b_select');
    if (start) start.textContent = NGI18n.t(selected ? 'touch.start_p2' : 'touch.start_p1');
    if (coin) {
      const text = NGI18n.t('touch.coin');
      coin.setAttribute('aria-label', text);
      coin.firstElementChild.textContent = text;
    }
    for (const area of [tools, panel, note]) {
      const bound = area.matches('[data-i18n-text]') ? [area] : area.querySelectorAll('[data-i18n-text]');
      for (const element of bound) element.textContent = NGI18n.t(element.dataset.i18nText);
    }
  }

  function sync() {
    const landscape = touchMode && started && !portrait.matches;
    game.classList.toggle('ng-touch-mode', touchMode);
    document.body.classList.toggle('ng-touch-landscape', landscape);
    game.classList.toggle('ng-touch-portrait', touchMode && portrait.matches);
    if (note) note.hidden = !touchMode || !portrait.matches || !failed;
    if (modeButton) {
      modeButton.hidden = !started || !touch || automatic;
      modeButton.setAttribute('aria-pressed', String(touchMode));
    }
    const full = tools?.querySelector('[data-touch-full]');
    const menu = tools?.querySelector('[data-touch-menu]');
    if (menu) {
      menu.title = NGI18n.t('touch.menu');
      menu.setAttribute('aria-label', menu.title);
    }
    if (full) full.setAttribute('data-i18n-text', session.active() ? 'touch.exit_fullscreen' : 'touch.fullscreen');
    translateTools();
    refreshGeometry();
  }

  window.addEventListener('blur', releaseTouches, options);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) releaseTouches();
  }, options);

  async function enter() {
    const locked = await session.enter();
    failed = !locked;
    sync();
  }

  // A trusted Start click still carries activation inside the player, including in the session iframe.
  game.addEventListener('click', event => {
    if (touchMode && event.isTrusted && event.target.closest('.ejs_start_button')) enter();
  }, { ...options, capture: true });
  portrait.addEventListener('change', () => { releaseTouches(); sync(); }, options);
  for (const type of ['fullscreenchange','webkitfullscreenchange']) document.addEventListener(type, () => {
    if (!session.active()) session.release();
    releaseTouches();
    sync();
  }, options);

  async function leave(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    releaseTouches();
    await session.exit();
    started = false;
    sync();
    const back = document.querySelector('.back-btn');
    // Continue through the existing library link, including its session bridge interception.
    back?.click();
  }

  function setTouchMode(enabled) {
    releaseTouches();
    if (!enabled) {
      session.release();
      panel.hidden = true;
      tools.querySelector('[data-touch-panel]').setAttribute('aria-expanded', 'false');
    }
    touchMode = enabled;
    // EmulatorJS owns the virtual gamepad and can keep it hidden after changing input mode.
    window.EJS_emulator?.toggleVirtualGamepad?.(enabled);
    sync();
    if (!enabled && !session.active()) modeButton?.focus({ preventScroll: true });
  }

  document.addEventListener('ng-touch-game-start', () => {
    if (!touch || started) return;
    started = true;
    const fragment = document.getElementById('ng-touch-tools').content.cloneNode(true);
    tools = fragment.querySelector('.ng-touch-tools');
    panel = fragment.querySelector('.ng-touch-panel');
    note = fragment.querySelector('.ng-rotate-note');
    const disableTouch = panel.querySelector('[data-touch-disable]');
    disableTouch.hidden = automatic;
    disableTouch.addEventListener('click', () => setTouchMode(false), options);
    modeButton?.addEventListener('click', () => setTouchMode(!touchMode), options);
    game.append(fragment);
    const manager = window.EJS_emulator.gameManager;
    const originalInput = manager.simulateInput;
    router = touchRouter((...args) => originalInput.apply(manager, args));
    manager.simulateInput = function (...args) {
      const token = scopes.get(window.event);
      return token ? router.run(token, () => router.dispatch(...args)) : router.dispatch(...args);
    };
    const coin = game.querySelector('.ejs_virtualGamepad_bottom .b_select');
    if (coin) {
      coin.classList.add('ng-touch-coin');
      coin.textContent = '';
      const label = document.createElement('span');
      label.dataset.i18nText = 'touch.coin';
      // The vendor reads event.target. Keep the existing control as the hit target.
      coin.append(label);
    }
    for (const button of tools.querySelectorAll('[data-touch-player]')) {
      button.addEventListener('click', () => {
        const next = Number(button.dataset.touchPlayer);
        if (next === selected) return;
        releaseTouches();
        router.select(next);
        selected = next;
        for (const option of tools.querySelectorAll('[data-touch-player]'))
          option.setAttribute('aria-pressed', String(option === button));
        translateTools();
      }, options);
    }
    const toggle = tools.querySelector('[data-touch-panel]');
    toggle.addEventListener('click', () => {
      releaseTouches();
      panel.hidden = !panel.hidden;
      toggle.setAttribute('aria-expanded', String(!panel.hidden));
      if (!panel.hidden) panel.querySelector('input').focus({ preventScroll: true });
    }, options);
    panel.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !panel.hidden) {
        event.stopPropagation();
        panel.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
        toggle.focus({ preventScroll: true });
      }
    }, options);
    panel.addEventListener('input', () => apply(Object.fromEntries(new FormData(panel)), true), options);
    panel.addEventListener('submit', event => event.preventDefault(), options);
    panel.addEventListener('reset', event => { event.preventDefault(); apply(defaults, true); }, options);
    tools.querySelector('[data-touch-menu]').addEventListener('click', () => {
      releaseTouches();
      window.EJS_emulator?.menu?.toggle();
    }, options);
    tools.querySelector('[data-touch-full]').addEventListener('click', () => {
      if (session.active()) session.exit();
      else enter();
    }, options);
    tools.querySelector('[data-touch-back]').addEventListener('click', leave, options);
    document.addEventListener('ng-language-changed', sync, options);
    apply(prefs);
    sync();
  }, options);

  window.addEventListener('pagehide', event => {
    session.exit();
    releaseTouches();
    cancelAnimationFrame(resizeFrame);
    if (!event.persisted) { observer?.disconnect(); listeners.abort(); }
  }, options);
})();
