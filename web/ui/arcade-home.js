'use strict';
(function (root) {
  const series = [
    { id: 'kof', name: 'The King of Fighters', games: ['kof94','kof95','kof96','kof97','kof98','kof99','kof2000','kof2001','kof2002','kof2003'] },
    { id: 'metal-slug', name: 'Metal Slug', games: ['mslug','mslug2','mslugx','mslug3','mslug4','mslug5'] },
    { id: 'samurai', name: 'Samurai Shodown', games: ['samsho','samsho2','samsho3','samsho4','samsho5','samsh5sp'] }
  ];
  const byId = id => document.getElementById(id);
  const t = (key, params) => root.NGI18n.t(key, params);
  const matches = (id, game) => series.some(group => group.id === id && group.games.includes(game.id));
  const seriesFor = game => series.find(group => group.games.includes(game.id));
  let requested = null, current = null, controls, offlineRequest = 0;
  let featuredGames = [];
  const decoded = new Set();
  let shownDots = [];
  let pendingPreview, retiringPreview, displayed = null, direction = 1;

  // Prefer the most recently played game, then stable catalog choices with previews.
  function choose(games, recent) {
    const indexed = new Map(games.map(game => [game.id, game]));
    const pool = [recent, ...['kof98','mslug','samsho4','garou','mslug3'].map(id => indexed.get(id)),
      ...games.filter(game => game.screenshot)].filter(Boolean);
    featuredGames = [...new Map(pool.map(game => [game.filename, game])).values()].slice(0, 5);
    return featuredGames.find(game => game.filename === requested) || featuredGames[0] || null;
  }

  function setFeature(game, isFavorite, category) {
    current = game || null;
    const last = root.NGLastPlayed?.read()?.filename;
    byId('arcade-last').disabled = !featuredGames.some(item => item.filename === last);
    byId('arcade-feature-category').textContent = category || '';
    const favorite = byId('arcade-feature-favorite');
    favorite.hidden = !game;
    favorite.textContent = isFavorite ? '♥' : '♡';
    favorite.setAttribute('aria-pressed', String(isFavorite));
    favorite.setAttribute('aria-label', t(isFavorite ? 'app.remove_from_favorites' : 'app.add_to_favorites'));
    const dots = byId('arcade-dots');
    if (shownDots.length !== featuredGames.length ||
        shownDots.some((item, index) => item.filename !== featuredGames[index].filename || item.title !== featuredGames[index].title)) {
      const previous = document.activeElement?.dataset.filename;
      shownDots = featuredGames;
      dots.replaceChildren(...featuredGames.map(item => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.filename = item.filename;
        button.setAttribute('aria-label', item.title);
        button.addEventListener('click', () => selectFeature(item.filename));
        return button;
      }));
      [...dots.children].find(button => button.dataset.filename === previous)?.focus();
    }
    for (const button of dots.children)
      button.setAttribute('aria-pressed', String(button.dataset.filename === game?.filename));
    byId('arcade-carousel').hidden = featuredGames.length < 2;
    if (!game) {
      const title = byId('featured-title');
      title.removeAttribute('data-no-i18n');
      title.textContent = t('arcade.setup');
      byId('featured-description').textContent = '';
    }
    const play = byId('featured-play');
    const label = game ? 'arcade.play' : 'index.manage_library';
    play.setAttribute('data-i18n-text', label);
    play.textContent = t(label);
    if (!game) play.href = '#local-library';
  }

  function selectFeature(filename, step = Math.sign(featuredGames.findIndex(item => item.filename === filename) - featuredGames.indexOf(current))) {
    direction = step || 1;
    requested = filename;
    controls.feature();
  }

  function moveFeature(step) {
    if (!featuredGames.length) return;
    const desired = featuredGames.findIndex(game => game.filename === requested);
    const at = desired < 0 ? featuredGames.indexOf(current) : desired;
    selectFeature(featuredGames[(at + step + featuredGames.length) % featuredGames.length].filename, step);
  }

  // Offline package status comes from the active worker and does not require a network request.
  async function refreshOffline() {
    const request = ++offlineRequest;
    const field = byId('arcade-offline');
    let ready = false;
    let outdated = false;
    try {
      const worker = navigator.serviceWorker?.controller;
      if (worker) {
        const result = await new Promise(resolve => {
          const channel = new MessageChannel();
          const timer = setTimeout(() => { channel.port1.close(); resolve(null); }, 1200);
          channel.port1.onmessage = ({ data }) => {
            clearTimeout(timer); channel.port1.close(); resolve(data);
          };
          worker.postMessage({ command: 'STATUS' }, [channel.port2]);
        });
        ready = result?.ready;
        outdated = result?.updateAvailable;
      }
    } catch (_) {}
    if (request === offlineRequest)
      field.textContent = t(outdated ? 'arcade.offline_update' : ready ? 'app.ready' : 'arcade.not_installed');
  }

  function updateCollection(games, catalog, favoriteCount) {
    const total = catalog?.length;
    const percent = total ? games.length * 100 / total : null;
    byId('arcade-catalog').textContent = total ?? '—';
    byId('stat-games').textContent = total != null ? `${games.length}/${total}` : games.length;
    const refs = catalog?.filter(game => game.screenshot).length;
    const available = games.filter(game => game.screenshot).length;
    byId('stat-shots').textContent = refs != null ? `${available}/${refs}` : available;
    byId('arcade-decoded').textContent = `${decoded.size}/${available}`;
    byId('arcade-favorites').textContent = favoriteCount;
    byId('arcade-connection').textContent = t(games.length ? 'arcade.connected' : 'arcade.not_connected');
    byId('arcade-percent').textContent = percent === null ? '—' : `${Math.floor(percent)}%`;
    byId('arcade-ring').style.setProperty('--completion', (percent || 0) + '%');
    const links = byId('arcade-series-links');
    const ids = new Set(games.map(game => game.id));
    for (const group of series) {
      links.querySelector(`[data-series="${group.id}"] small`).textContent =
        `${group.games.filter(id => ids.has(id)).length}/${group.games.length}`;
    }
    refreshOffline();
  }

  function setFilter(value) {
    byId('arcade-series').value = value || '';
    for (const button of byId('arcade-series-links').querySelectorAll('button'))
      button.setAttribute('aria-pressed', String(button.dataset.series === value));
  }

  // The backdrop borrows the foreground URL. Preview Provider remains its sole owner.
  function clearArtwork() {
    const hero = byId('arcade-hero');
    hero.classList.remove('has-artwork');
    hero.style.removeProperty('--arcade-artwork');
  }

  function revealArtwork(img) {
    if (!img.naturalWidth || img.hidden || !img.currentSrc) return;
    const hero = byId('arcade-hero');
    hero.style.setProperty('--arcade-artwork', 'url(' + JSON.stringify(img.currentSrc) + ')');
    hero.classList.add('has-artwork');
  }

  function removePreview(img) {
    if (root.NG_STATIC) root.NGPreviews.detach(img);
    img.remove();
  }

  // Keep the committed image bound until its outgoing foreground and backdrop finish fading.
  function present(game, commit, refresh) {
    if (pendingPreview) {
      removePreview(pendingPreview);
      pendingPreview = null;
    }
    const hero = byId('arcade-hero'), old = byId('featured-image');
    if (!refresh && game?.filename === displayed?.filename && old.naturalWidth) {
      commit(old, true);
      return;
    }
    const next = document.createElement('img');
    next.alt = old.alt;
    next.setAttribute('data-i18n-attrs', old.getAttribute('data-i18n-attrs'));
    next.className = 'arcade-staged-image';
    old.before(next);
    pendingPreview = next;
    function finish(loaded) {
      if (pendingPreview !== next) return;
      pendingPreview = null;
      retiringPreview?.();
      const animated = loaded && old.naturalWidth && game?.filename !== displayed?.filename &&
        !document.hidden && !document.body.classList.contains('ng-living-reduced') &&
        !matchMedia('(prefers-reduced-motion: reduce)').matches && typeof next.animate === 'function';
      const shift = 12 * direction * (document.documentElement.dir === 'rtl' ? -1 : 1);
      const copy = hero.querySelector('.hero-copy');
      let fadingCopy, backdrop;
      if (animated) {
        fadingCopy = copy.cloneNode(true);
        fadingCopy.removeAttribute('id');
        fadingCopy.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
        fadingCopy.inert = true;
        fadingCopy.setAttribute('aria-hidden', 'true');
        fadingCopy.classList.add('arcade-outgoing-copy');
        const box = copy.getBoundingClientRect(), frame = hero.getBoundingClientRect();
        Object.assign(fadingCopy.style, { left: box.left - frame.left + 'px', top: box.top - frame.top + 'px', width: box.width + 'px' });
        hero.append(fadingCopy);
        backdrop = document.createElement('div');
        backdrop.className = 'arcade-outgoing-backdrop';
        backdrop.style.backgroundImage = 'url(' + JSON.stringify(old.currentSrc) + ')';
        hero.prepend(backdrop);
      }
      old.removeAttribute('id');
      next.id = 'featured-image';
      next.className = '';
      next.hidden = !loaded;
      displayed = game;
      if (loaded) revealArtwork(next);
      else clearArtwork();
      commit(next, true);
      if (!animated) {
        removePreview(old);
        return;
      }
      old.classList.add('arcade-outgoing-image');
      const config = { duration: 300, easing: 'ease-out', fill: 'both' };
      const incoming = [copy, next].map(el => el.animate(
        [{ opacity: 0, transform: `translateX(${shift}px)` }, { opacity: 1, transform: 'none' }], config));
      const leaving = [fadingCopy, old].map(el => el.animate(
        [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-shift}px)` }], config));
      leaving.push(backdrop.animate([{ opacity: .72 }, { opacity: 0 }], config));
      const clean = () => {
        if (retiringPreview !== clean) return;
        retiringPreview = null;
        for (const animation of [...incoming, ...leaving]) animation.cancel();
        fadingCopy.remove();
        backdrop.remove();
        removePreview(old);
      };
      retiringPreview = clean;
      leaving[0].finished.then(clean, clean);
    }
    if (!game?.screenshot) { finish(false); return; }
    next.addEventListener('load', async () => {
      // The provider also probes decode, but the displayed image must itself be ready.
      try { await next.decode(); } catch (_) { finish(false); return; }
      finish(Boolean(next.naturalWidth));
    }, { once: true });
    next.addEventListener('error', () => finish(false), { once: true });
    next.dataset.preview = game.screenshot;
    if (root.NG_STATIC) root.NGPreviews.attach(next, game.screenshot, { eager: true });
    else next.src = '/api/shot/' + encodeURIComponent(game.screenshot);
  }

  function mount(callbacks) {
    controls = callbacks;
    byId('arcade-download').addEventListener('click', () => {
      root.NGDialog.alert(t('arcade.assets_pending'), t('arcade.download_assets'));
    });
    const select = byId('arcade-series');
    const seriesLinks = byId('arcade-series-links');
    for (const group of series) {
      select.add(new Option(group.name, group.id));
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.series = group.id;
      button.setAttribute('aria-pressed', 'false');
      button.append(document.createTextNode(group.name), document.createElement('small'));
      button.addEventListener('click', () => callbacks.series(group.id, true));
      seriesLinks.append(button);
    }
    select.addEventListener('change', () => callbacks.series(select.value, false));
    byId('arcade-genre').addEventListener('change', event => callbacks.genre(event.target.value));
    byId('arcade-prev').addEventListener('click', () => moveFeature(-1));
    byId('arcade-next').addEventListener('click', () => moveFeature(1));
    byId('arcade-feature-favorite').addEventListener('click', () => { if (current) callbacks.favorite(current); });
    byId('arcade-last').addEventListener('click', () => {
      selectFeature(root.NGLastPlayed?.read()?.filename);
      byId('arcade-hero').scrollIntoView();
    });
    const openLibrary = () => {
      const panel = byId('local-library');
      if (panel) panel.open = true;
    };
    byId('arcade-manage').addEventListener('click', openLibrary);
    byId('featured-play').addEventListener('click', () => { if (!current) openLibrary(); });
    const menu = byId('arcade-menu'), compact = matchMedia('(max-width: 760px)');
    const resize = () => { menu.open = !compact.matches; };
    compact.addEventListener('change', resize);
    resize();
    // The settings page opens on its Controls tab; target the existing manager.
    const gamepads = document.querySelector('.arcade-gamepad');
    gamepads.hash = 'ng-gamepad-manager-root';
    const language = byId('arcade-language');
    language.value = NGI18n.getLanguage();
    language.addEventListener('change', () => NGI18n.setLanguage(language.value));
    document.addEventListener('ng-language-changed', () => { language.value = NGI18n.getLanguage(); });
    const record = name => {
      if (!name || decoded.has(name)) return;
      decoded.add(name);
      byId('arcade-decoded').textContent = `${decoded.size}/${callbacks.available()}`;
    };
    document.addEventListener('ng-preview-decoded', event => record(event.detail.name));
    byId('game-grid').addEventListener('load', event => {
      if (!root.NG_STATIC && event.target.naturalWidth) record(event.target.dataset.preview);
    }, true);
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', event => {
      if (event.matches) retiringPreview?.();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) retiringPreview?.();
    });
    document.addEventListener('click', event => {
      if (event.target.closest('#ng-living-motion') && document.body.classList.contains('ng-living-reduced'))
        retiringPreview?.();
    });
    navigator.serviceWorker?.addEventListener('controllerchange', refreshOffline);
    addEventListener('pageshow', refreshOffline);
  }

  root.NGArcade = { mount, choose, setFeature, matches, seriesFor, setFilter, updateCollection, present,
    resetFeature() { requested = null; }, resetDecoded() { decoded.clear(); } };
})(globalThis);
