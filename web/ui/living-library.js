/* Living Library v1.5.0: home-only presentation and discovery; no emulator/input hooks. */
'use strict';
(function (root) {
  const doc = root.document;
  if (!doc?.body?.classList?.contains('home-page')) return;

  const KEY = 'ng-living-library-motion-v1';
  const reduce = root.matchMedia?.('(prefers-reduced-motion: reduce)');
  const coarse = root.matchMedia?.('(pointer: coarse)');
  const $ = selector => doc.querySelector(selector);
  const t = (key, params) => root.NGI18n?.t?.('living_library.' + key, params) || key;
  const state = {
    enabled: true, picked: null, pickTimer: null, pointerFrame: null,
    pendingPointer: null, counting: new Map(), observers: [], lastMessage: null
  };

  // Motion preference is independent from saved game and EmulatorJS settings.
  function readPreference() {
    try { return root.localStorage?.getItem(KEY) !== 'off'; }
    catch (_) { return true; }
  }
  state.enabled = readPreference();

  function canAnimate() {
    return state.enabled && !reduce?.matches && !doc.hidden;
  }
  function syncMotion() {
    const motion = canAnimate();
    doc.body.classList.toggle('ng-living-reduced', !motion);
    const button = $('#ng-living-motion');
    if (button) {
      button.textContent = reduce?.matches ? t('system_reduced') : t(state.enabled ? 'motion_on' : 'motion_off');
      button.setAttribute('aria-pressed', String(motion));
      button.disabled = Boolean(reduce?.matches);
      button.setAttribute('aria-label', t('motion_label'));
      button.title = t('motion_label');
    }
    if (!motion && state.pointerFrame !== null) {
      root.cancelAnimationFrame?.(state.pointerFrame);
      state.pointerFrame = null;
      state.pendingPointer = null;
    }
    if (!motion) for (const [element, current] of state.counting) {
      root.cancelAnimationFrame?.(current.frame);
      element.textContent = String(current.target);
      state.counting.delete(element);
    }
  }
  function savePreference(value) {
    state.enabled = value;
    try { root.localStorage?.setItem(KEY, value ? 'on' : 'off'); } catch (_) { /* Session-only preference. */ }
    syncMotion();
  }

  // All visible labels come from the centralized Arabic/English catalog.
  function translate() {
    const kicker = $('#ng-living-kicker');
    const pick = $('#ng-living-pick');
    if (kicker) kicker.textContent = t('kicker');
    if (pick) {
      pick.textContent = t('pick');
      pick.setAttribute('aria-label', t('pick_hint'));
      pick.title = t('pick_hint');
    }
    const feedback = $('#ng-living-feedback');
    if (feedback && state.lastMessage)
      feedback.textContent = t(state.lastMessage.key, state.lastMessage.params);
    syncMotion();
  }

  function visibleCards() {
    return Array.from($('#game-grid')?.querySelectorAll('.game-card') || [])
      .filter(card => !card.hidden);
  }
  function updatePickAvailability() {
    const button = $('#ng-living-pick');
    if (button) button.disabled = visibleCards().length === 0;
  }

  // Pick among rendered results only; never launch games or bypass search/favorite filters.
  function surpriseMe() {
    const cards = visibleCards();
    const feedback = $('#ng-living-feedback');
    if (!cards.length) {
      state.lastMessage = { key: 'no_results', params: {} };
      if (feedback) feedback.textContent = t('no_results');
      return false;
    }
    const index = Math.min(cards.length - 1, Math.floor(Math.random() * cards.length));
    const picked = cards[index];
    state.picked?.classList.remove('ng-living-picked');
    if (state.pickTimer !== null) root.clearTimeout?.(state.pickTimer);
    picked.classList.add('ng-living-picked');
    state.picked = picked;
    const title = picked.querySelector('.game-title');
    state.lastMessage = { key: 'picked', params: { title: title?.textContent || '' } };
    if (feedback) feedback.textContent = t('picked', state.lastMessage.params);
    picked.scrollIntoView?.({ behavior: canAnimate() ? 'smooth' : 'auto', block: 'center' });
    title?.focus?.({ preventScroll: true });
    state.pickTimer = root.setTimeout?.(() => {
      picked.classList.remove('ng-living-picked');
      if (state.picked === picked) state.picked = null;
      state.pickTimer = null;
    }, 2800) ?? null;
    return true;
  }

  // Animate only real numeric library counts, and never modify underlying data.
  function animateCount(element) {
    if (!element || state.counting.has(element)) return;
    const raw = element.textContent.trim();
    if (!/^\d{1,6}$/.test(raw)) return;
    const target = Number(raw);
    if (element.dataset.ngLivingCount === String(target)) return;
    element.dataset.ngLivingCount = String(target);
    if (!canAnimate() || typeof root.requestAnimationFrame !== 'function' || target === 0) return;
    const duration = 680;
    let started = null;
    const current = { target, frame: null };
    state.counting.set(element, current);
    function paint(now) {
      if (!canAnimate()) {
        element.textContent = String(target);
        state.counting.delete(element);
        return;
      }
      started ??= now;
      const progress = Math.min(1, (now - started) / duration);
      element.textContent = String(Math.round(target * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) current.frame = root.requestAnimationFrame(paint);
      else {
        element.textContent = String(target);
        state.counting.delete(element);
      }
    }
    current.frame = root.requestAnimationFrame(paint);
  }
  function observeCounts() {
    for (const id of ['stat-games', 'stat-shots']) {
      const element = doc.getElementById(id);
      if (!element) continue;
      if (typeof root.MutationObserver === 'function') {
        const observer = new root.MutationObserver(() => animateCount(element));
        observer.observe(element, { childList: true, characterData: true, subtree: true });
        state.observers.push(observer);
      }
      animateCount(element);
    }
  }

  // One delegated pointer listener covers replacement, filtering, and Load More cards.
  function paintPointer() {
    state.pointerFrame = null;
    const pending = state.pendingPointer;
    state.pendingPointer = null;
    if (!pending || !canAnimate()) return;
    const bounds = pending.element.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const x = Math.max(0, Math.min(1, (pending.x - bounds.left) / bounds.width));
    const y = Math.max(0, Math.min(1, (pending.y - bounds.top) / bounds.height));
    pending.element.style.setProperty('--ng-living-x', `${Math.round(x * 100)}%`);
    pending.element.style.setProperty('--ng-living-y', `${Math.round(y * 100)}%`);
    pending.element.style.setProperty('--ng-living-ry', `${((x - 0.5) * 5).toFixed(2)}deg`);
    pending.element.style.setProperty('--ng-living-rx', `${((0.5 - y) * 5).toFixed(2)}deg`);
  }
  function pointerMove(event) {
    if (!canAnimate() || coarse?.matches || (event.pointerType && event.pointerType !== 'mouse')) return;
    const target = event.target?.closest?.('.game-card, .hero-art');
    if (!target || !doc.body.contains(target)) return;
    state.pendingPointer = { element: target, x: event.clientX, y: event.clientY };
    if (state.pointerFrame === null && root.requestAnimationFrame)
      state.pointerFrame = root.requestAnimationFrame(paintPointer);
  }

  function mount() {
    const hero = $('.hero-copy');
    const heading = $('.collection-heading');
    const grid = $('#game-grid');
    if (!hero || !heading || !grid || $('#ng-living-motion')) return;

    const kicker = doc.createElement('span');
    kicker.id = 'ng-living-kicker';
    kicker.className = 'ng-living-kicker';
    hero.insertBefore(kicker, hero.firstChild);

    const actions = doc.createElement('div');
    actions.className = 'ng-living-actions';
    const pick = doc.createElement('button');
    pick.type = 'button';
    pick.id = 'ng-living-pick';
    pick.className = 'ng-living-pick';
    const motion = doc.createElement('button');
    motion.type = 'button';
    motion.id = 'ng-living-motion';
    motion.className = 'ng-living-motion';
    actions.append(pick, motion);
    heading.appendChild(actions);

    const feedback = doc.createElement('p');
    feedback.id = 'ng-living-feedback';
    feedback.className = 'ng-living-feedback';
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-live', 'polite');
    feedback.setAttribute('aria-atomic', 'true');
    heading.insertAdjacentElement('afterend', feedback);

    pick.addEventListener('click', surpriseMe);
    motion.addEventListener('click', () => savePreference(!state.enabled));

    const art = $('.hero-art');
    if (art) {
      const orbit = doc.createElement('span');
      orbit.className = 'ng-living-orbit';
      orbit.setAttribute('aria-hidden', 'true');
      art.insertBefore(orbit, art.firstChild);
    }

    doc.body.classList.add('ng-living-ready');
    translate();
    updatePickAvailability();
    observeCounts();
    if (typeof root.MutationObserver === 'function') {
      const observer = new root.MutationObserver(updatePickAvailability);
      observer.observe(grid, { childList: true });
      state.observers.push(observer);
    }
    doc.addEventListener('pointermove', pointerMove, { passive: true });
    doc.addEventListener('ng-language-changed', translate);
    doc.addEventListener('visibilitychange', syncMotion);
    root.addEventListener('storage', event => {
      if (event.key === KEY) { state.enabled = readPreference(); syncMotion(); }
    });
    if (reduce?.addEventListener) reduce.addEventListener('change', syncMotion);
    else reduce?.addListener?.(syncMotion);
    root.addEventListener('pagehide', () => {
      if (state.pointerFrame !== null) root.cancelAnimationFrame?.(state.pointerFrame);
      if (state.pickTimer !== null) root.clearTimeout?.(state.pickTimer);
      state.pickTimer = null;
      state.picked?.classList.remove('ng-living-picked');
      state.picked = null;
      for (const [element, current] of state.counting) {
        root.cancelAnimationFrame?.(current.frame);
        element.textContent = String(current.target);
      }
      state.counting.clear();
    });
    root.addEventListener('pageshow', syncMotion);
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
  root.NGLivingLibrary = Object.freeze({ surpriseMe, canAnimate, KEY, syncMotion });
})(window);
