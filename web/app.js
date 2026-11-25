'use strict';

// Resolve library-page elements by ID.
const $ = id => document.getElementById(id);
const state = {
  games: [],
  summary: null,
  engine: null,
  view: 'all',
  category: null,
  series: null,
  query: '',
  visibleCount: 30
};
const favoriteKey = 'neogeo-webemu-favorites-v1';
let favorites = new Set();

try {
  const list = JSON.parse(localStorage.getItem(favoriteKey) || '[]');
  if (Array.isArray(list)) favorites = new Set(list.filter(s => typeof s === 'string'));
} catch (_) {}

const categoryKeys = {
  fighting: 'app.fighting',
  action: 'app.action',
  shooter: 'app.shooters',
  sports: 'app.sports',
  puzzle: 'app.puzzles',
  other: 'app.other'
};
const categoryName = category => NGI18n.t(categoryKeys[category] || categoryKeys.other);

// Format library sizes in gigabytes or megabytes for display.
const bytes = n =>
  n >= 1073741824 ? (n / 1073741824).toFixed(2) + ' GB' : (n / 1048576).toFixed(1) + ' MB';

// Create an element with optional class and plain-text content.
function node(tag, className, content) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (content !== undefined) e.textContent = content;
  return e;
}

// Build the local server URL for a catalog screenshot.
function shot(g) {
  return '/api/shot/' + encodeURIComponent(g.screenshot);
}

// Keep player links relative in static builds and root-based in Python mode.
function gameLink(g) {
  return (
    (window.NG_STATIC ? './player.html?rom=' : '/player.html?rom=') +
    encodeURIComponent(g.filename)
  );
}

// Update the library notice and hide it when no message is supplied.
function showBanner(text) {
  const b = $('banner');
  b.hidden = !text;
  b.textContent = text || '';
}

// Refresh active filters and count favorites present in the loaded library.
function updateNavigation() {
  document
    .querySelectorAll('[data-view]')
    .forEach(el =>
      el.classList.toggle('active', !state.category && !state.series && el.dataset.view === state.view)
    );
  document
    .querySelectorAll('[data-category]')
    .forEach(el => el.classList.toggle('active', state.category === el.dataset.category));
  const favoriteCount = state.games.filter(g => favorites.has(g.filename)).length;
  $('favorite-count').textContent = favoriteCount;
  if ($('arcade-favorites')) $('arcade-favorites').textContent = favoriteCount;
  if ($('arcade-genre')) $('arcade-genre').value = state.category || '';
  window.NGArcade?.setFilter(state.series);
}

// Apply the chosen filter, redraw the grid, and scroll to it on narrow screens.
function switchView(view, category, series = null, scroll = false) {
  state.view = view;
  state.category = category || null;
  state.series = series;
  state.visibleCount = 30;
  updateNavigation();
  render();
  if (scroll || innerWidth < 780) $('collection').scrollIntoView({ block: 'start' });
}

// Toggle the in-memory favorite, attempt persistence, and refresh the library view.
function toggleFavorite(g) {
  if (favorites.has(g.filename)) favorites.delete(g.filename);
  else favorites.add(g.filename);
  try {
    localStorage.setItem(favoriteKey, JSON.stringify([...favorites]));
  } catch (_) {}
  updateNavigation();
  window.NGArcade?.setFeature(state.featured, favorites.has(state.featured?.filename), state.featured && categoryName(state.featured.category));
  render();
}

// Build a game card with preview, launch links, metadata, and a favorite button.
function card(g) {
  const item = node('article', 'game-card');
  item.dataset.category = g.category || 'other';

  const cover = node('div', 'game-cover');
  const imageLink = node('a', 'game-image-link');
  imageLink.href = gameLink(g);
  imageLink.setAttribute('aria-label', NGI18n.t('common.playNamed', { title: g.title }));

  if (g.screenshot) {
    const img = node('img', 'game-image');
    img.dataset.preview = g.screenshot;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = NGI18n.t('common.imageNamed', { title: g.title });
    if (window.NG_STATIC) NGPreviews.attach(img, g.screenshot);
    else img.src = shot(g);

    // Replace an unreadable preview with the launch placeholder.
    img.addEventListener('error', () => {
      imageLink.replaceChildren(
        node('span', 'cover-placeholder', 'NEO·GEO'),
        node('span', 'play-indicator', NGI18n.t('app.play_game'))
      );
    });
    imageLink.appendChild(img);
  } else {
    imageLink.appendChild(node('span', 'cover-placeholder', 'NEO·GEO'));
  }

  imageLink.appendChild(node('span', 'play-indicator', NGI18n.t('app.play_game')));
  cover.appendChild(imageLink);

  const isFav = favorites.has(g.filename);
  const fav = node(
    'button',
    'favorite-button' + (isFav ? ' is-favorite' : ''),
    isFav ? '♥' : '♡'
  );
  fav.type = 'button';
  fav.title = isFav ? NGI18n.t('app.remove_from_favorites') : NGI18n.t('app.add_to_favorites');
  fav.setAttribute('aria-label', fav.title);
  fav.setAttribute('aria-pressed', String(isFav));
  fav.addEventListener('click', () => {
    const restoreFocus = document.activeElement === fav;
    toggleFavorite(g);
    if (restoreFocus) {
      const cardLink = document.querySelector(`#game-grid a[href="${CSS.escape(gameLink(g))}"]`);
      (cardLink?.closest('.game-card')?.querySelector('.favorite-button') ||
        document.querySelector('[data-view="favorites"]'))?.focus({ preventScroll: true });
    }
  });


  const category = node(
    'span',
    'cover-category',
    categoryName(g.category)
  );

  item.appendChild(cover);

  const details = node('div', 'game-details');
  const title = node('a', 'game-title', g.title);
  title.href = gameLink(g);
  title.title = g.title;
  title.dir = 'auto';
  const heading = node('div', 'arcade-card-heading');
  heading.append(title, fav);
  details.appendChild(heading);

  const meta = node('div', 'game-meta');
  meta.title =
    g.selected_filename && g.selected_filename !== g.filename
      ? `${g.filename} → ${g.selected_filename}`
      : g.filename;
  const size = node('span', 'game-size', bytes(g.size));
  meta.append(category, size);
  details.appendChild(meta);
  item.appendChild(details);

  return item;
}

// Filter and sort the loaded games, then replace the result grid or show an empty state.
function render(appendOnly = false) {
  const query = state.query.trim().toLocaleLowerCase();
  let games = state.games.filter(g => {
    if (state.category && g.category !== state.category) return false;
    if (state.series && !window.NGArcade?.matches(state.series, g)) return false;
    if (state.view === 'favorites' && !favorites.has(g.filename)) return false;
    if (state.view === 'images' && !g.screenshot) return false;
    return (
      !query ||
      (g.title + ' ' + g.filename + ' ' + (g.driver || '') + ' ' + (window.NGArcade?.seriesFor(g)?.name || '')).toLocaleLowerCase().includes(query)
    );
  });

  const sort = $('sort').value;
  games = [...games].sort((a, b) =>
    sort === 'size'
      ? b.size - a.size
      : String(a[sort === 'filename' ? 'filename' : 'title']).localeCompare(
          String(b[sort === 'filename' ? 'filename' : 'title']),
          'en'
        )
  );

  const label = state.category
    ? categoryName(state.category)
    : state.view === 'favorites'
      ? NGI18n.t('app.favorite_games')
      : state.view === 'images'
        ? NGI18n.t('app.games_with_previews')
        : NGI18n.t('app.all_games');

  $('collection-title').firstChild.textContent = label + ' ';
  $('results').textContent = games.length;
  $('filter-description').textContent =
    (query ? NGI18n.t('app.search_results_in') + ' ' : NGI18n.t('app.browse') + ' ') + label;

  const grid = $('game-grid');
  const paging = window.NGPrefs?.load()?.loadMoreGames !== false;
  const shown = Math.min(paging ? state.visibleCount : games.length, games.length);
  const more = $('ng-load-more');
  more.hidden = shown >= games.length;
  $('ng-game-progress').dataset.counts = `${shown}/${games.length}`;
  $('ng-game-progress').textContent = NGI18n.t('app.showing_games_count', { shown, total: games.length });
  if (!games.length) {
    const msg = !state.games.length
      ? NGI18n.t('app.no_games_are_linked_yet_use_the')
      : state.view === 'favorites'
        ? NGI18n.t('app.your_favorites_are_empty_select_the_heart')
        : NGI18n.t('app.no_games_match_this_category_or_search');
    grid.replaceChildren(node('div', 'empty-state', msg));
  } else {
    const fragment = document.createDocumentFragment();
    const start = appendOnly && paging ? Math.max(0, state.visibleCount - 30) : 0;
    for (const g of games.slice(start, shown)) fragment.appendChild(card(g));
    if (appendOnly && paging) grid.appendChild(fragment);
    else grid.replaceChildren(fragment);
    window.NGLibraryMotion?.reveal(
      [...grid.querySelectorAll('.game-card')].slice(appendOnly && paging ? start : 0),
      !appendOnly || !paging
    );
  }
}

// Prefer a featured game with a screenshot, falling back to any illustrated game.
function feature(refresh = false) {
  const games = state.games;
  const last = window.NGLastPlayed?.read();
  const recent = last ? games.find(g => g.filename === last.filename) : null;
  const featured = window.NGArcade ? window.NGArcade.choose(games, recent) : recent ||
    ['mslug3', 'kof98', 'blazstar', 'samsho2', 'garou', 'mslug']
      .map(id => games.find(g => g.id.toLowerCase() === id && g.screenshot))
      .find(Boolean) || games.find(g => g.screenshot);
  if (window.NGArcade) {
    window.NGArcade.present(featured, commit, refresh);
  } else {
    commit($('featured-image'), false);
  }

  function commit(img, prepared) {
    const placeholder = $('feature-placeholder');
    if (!prepared) {
      img.hidden = true;
      if (window.NG_STATIC) NGPreviews.detach?.(img);
      img.removeAttribute('src');
    }
    placeholder.hidden = Boolean(featured?.screenshot && (!prepared || img.naturalWidth));
    if (window.NGArcade) {
      state.featured = featured;
      window.NGArcade.setFeature(featured, favorites.has(featured?.filename), featured && categoryName(featured.category));
    }
    if (!featured) return;
    $('featured-title').setAttribute('data-no-i18n', '');
    $('featured-title').textContent = featured.title;
    $('featured-description').textContent = NGI18n.t(
      featured === recent ? 'app.last_played_game_description' : 'app.a_verified_arcade_game_from_your_local'
    );
    $('featured-play').href = gameLink(featured);
    if (prepared || !featured.screenshot) return;
    // Bind one stable image failure handler even across library rescans.
    if (!img.dataset.ngFeaturedErrorBound) {
      img.addEventListener('error', () => {
        img.hidden = true;
        placeholder.hidden = false;
      });
      img.dataset.ngFeaturedErrorBound = '1';
    }
    img.dataset.preview = featured.screenshot;
    if (window.NG_STATIC) NGPreviews.attach(img, featured.screenshot);
    else img.src = shot(featured);
    img.hidden = false;
  }
}

// Reflect the local installation and bundled-core status in the active language.
function updateEngineLabel() {
  $('engine-health').textContent = state.engine?.ready
    ? NGI18n.t(window.NG_STATIC ? 'app.fbneo_is_included' : 'app.engine_ready')
    : NGI18n.t('app.engine_installation_required');
}

// Load browser-linked or server library data and update counters, notices, and game cards.
async function load() {
  showBanner('');
  try {
    let data;
    if (window.NG_STATIC) {
      await NGLocal.init();
      data = NGLocal.data();
      NGPreviews.clear();
      window.NGArcade?.resetDecoded();
    } else {
      const response = await fetch('/api/games', { cache: 'no-store' });
      if (!response.ok) throw Error('HTTP ' + response.status);
      data = await response.json();
    }
    state.games = data.games;
    state.summary = data.summary;
    state.engine = data.engine;
    $('stat-games').textContent = data.summary.games;
    $('stat-shots').textContent = data.summary.with_screenshots;
    $('stat-size').textContent = bytes(data.summary.total_bytes);
    $('stat-bios').textContent = data.summary.bios_present
      ? NGI18n.t('app.ready')
      : NGI18n.t('app.missing');
    $('side-count').textContent = data.summary.games;
    updateEngineLabel();

    const notices = [];
    if (!data.engine.ready) notices.push(NGI18n.t('app.fbneo_files_are_incomplete_run_py_3'));
    if (!data.summary.bios_present) {
      notices.push(
        window.NG_STATIC
          ? NGI18n.t('app.link_bios_neogeo_zip_using_the_local')
          : NGI18n.t('app.neogeo_zip_was_not_found_in_roms')
      );
    }
    if (!data.summary.with_screenshots && data.summary.games) {
      notices.push(
        window.NG_STATIC
          ? NGI18n.t('app.link_previews_to_display_game_images')
          : NGI18n.t('app.no_matching_images_found_check_previews')
      );
    }
    showBanner(notices.join('  •  '));
    updateNavigation();
    window.NGArcade?.updateCollection(state.games, window.NGLocal?.manifest?.games, Number($('favorite-count').textContent));
    feature(true);
    render();
  } catch (err) {
    state.games = [];
    showBanner(NGI18n.t('app.could_not_load_the_local_game_library') + ' ' + err.message);
    render();
  }
}

document
  .querySelectorAll('[data-view]')
  .forEach(el => el.addEventListener('click', () => switchView(el.dataset.view, null)));
document
  .querySelectorAll('[data-category]')
  .forEach(el => el.addEventListener('click', () => switchView('all', el.dataset.category)));

// Update search results immediately as the query changes.
$('search').addEventListener('input', e => {
  state.query = e.target.value;
  state.visibleCount = 30;
  render();
});
$('sort').addEventListener('change', () => { state.visibleCount = 30; render(); });
$('ng-load-more-btn').addEventListener('click', () => {
  state.visibleCount += 30;
  render(true);
});
// Reflect a saved paging preference from another tab or an embedded Settings page.
window.addEventListener('storage', event => {
  if (event.key !== window.NGPrefs?.KEY) return;
  state.visibleCount = 30;
  render();
});
document.addEventListener('ng-language-changed', () => {
  const count = $('ng-game-progress');
  const match = /^(\d+)\s*\/\s*(\d+)$/.exec(count.dataset.counts || '');
  if (match) count.textContent = NGI18n.t('app.showing_games_count', { shown: Number(match[1]), total: Number(match[2]) });
});

// Focus search with slash and clear it with Escape when the search field is active.
document.addEventListener('keydown', event => {
  if (
    event.key === '/' &&
    document.activeElement !== $('search') &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey
  ) {
    event.preventDefault();
    $('search').focus();
  }
  if (event.key === 'Escape' && document.activeElement === $('search')) {
    $('search').value = '';
    state.query = '';
    state.visibleCount = 30;
    render();
    $('search').blur();
  }
});

// Refresh the hero when a same-origin game iframe returns to its parent library.
document.addEventListener('ng-library-return', () => { window.NGArcade?.resetFeature(); feature(); });
document.addEventListener('ng-language-changed', () => {
  if (state.summary) {
    updateEngineLabel();
    $('stat-bios').textContent = NGI18n.t(state.summary.bios_present ? 'app.ready' : 'app.missing');
    window.NGArcade?.updateCollection(state.games, window.NGLocal?.manifest?.games, Number($('favorite-count').textContent));
  }
  feature();
  render();
});

if (window.NG_STATIC) {
  // Wait for the library refresh promise before reloading static-page data.
  document.addEventListener('ng-library-changed', () => {
    if (NGLocal.ready) NGLocal.ready.then(load);
  });
}

window.NGArcade?.mount({
  feature,
  favorite: toggleFavorite,
  available: () => state.games.filter(game => game.screenshot).length,
  genre: category => switchView(state.view, category, state.series),
  series: (series, scroll) => switchView('all', scroll ? null : state.category, series || null, scroll)
});
load();
