/* Live keyboard-to-gamepad reference, sourced only from saved first-party control profiles. */
'use strict';
(function (root) {
  const ACTION_GROUPS = Object.freeze({
    up: 'movement', down: 'movement', left: 'movement', right: 'movement',
    a: 'gameplay', b: 'gameplay', c: 'gameplay', d: 'gameplay',
    start: 'system', coin: 'system',
    combo_ab: 'combo', combo_abc: 'combo', combo_cd: 'combo'
  });
  const PRIMARY = Object.freeze(['up', 'down', 'left', 'right', 'a', 'b', 'c', 'd', 'start', 'coin']);
  const ROWS = Object.freeze([
    [192, 49, 50, 51, 52, 53, 54, 55, 56, 57, 48, 189, 187, 8],
    [9, 81, 87, 69, 82, 84, 89, 85, 73, 79, 80, 219, 221],
    [20, 65, 83, 68, 70, 71, 72, 74, 75, 76, 186, 222, 13],
    [16, 90, 88, 67, 86, 66, 78, 77, 188, 190, 191],
    [32]
  ]);
  const ARROWS = Object.freeze([[38], [37, 40, 39]]);
  const NUMPAD = Object.freeze([[103, 104, 105], [100, 101, 102], [97, 98, 99], [96, 110]]);
  const SPECIAL = Object.freeze({
    8: 'Back', 9: 'Tab', 13: 'Enter', 16: 'Shift', 20: 'Caps', 32: 'Space',
    37: '\u2190', 38: '\u2191', 39: '\u2192', 40: '\u2193',
    186: ';', 187: '=', 188: ',', 189: '-', 190: '.', 191: '/', 192: '`',
    219: '[', 220: '\\', 221: ']', 222: "'", 110: 'Num .'
  });
  let host = null;
  let player = 0;
  const $ = id => root.document?.getElementById?.(id);
  const locale = key => root.NGI18n?.t?.('gamepad_visualizer.' + key) || key;

  // The same persisted keyboard profile and controller profile used for gameplay are authoritative.
  function snapshot(which = player) {
    const ctl = root.NGControls;
    const pad = root.NGGamepadRemap;
    if (!ctl?.load || !pad?.load || !ctl?.ACTIONS) return null;
    const playerId = Number(which);
    if (playerId !== 0 && playerId !== 1) return null;
    const keyboard = ctl.load().players?.[playerId];
    const mapped = pad.load().players?.[playerId];
    if (!keyboard) return null;
    const actions = ctl.ACTIONS.map(item => {
      const type = ACTION_GROUPS[item.id] || 'combo';
      const keyCode = Number(keyboard[item.id]);
      const gamepadCode = type === 'combo' ? null : (mapped ? mapped.bindings?.[item.id] ?? null : null);
      const gamepadLabel = type === 'combo' ? locale('keyboard_only')
        : !mapped ? locale('native')
          : gamepadCode === null ? locale('unmapped') : pad.readable(gamepadCode);
      return {
        id: item.id,
        symbol: item.symbol,
        name: item.label,
        group: type,
        keyCode,
        keyboardLabel: ctl.getLabel(keyCode),
        gamepadCode,
        gamepadLabel,
        native: !mapped && type !== 'combo'
      };
    });
    return { player: playerId, native: !mapped, actions };
  }

  function keyName(code) {
    if (Object.prototype.hasOwnProperty.call(SPECIAL, code)) return SPECIAL[code];
    if (code >= 65 && code <= 90) return String.fromCharCode(code);
    if (code >= 48 && code <= 57) return String.fromCharCode(code);
    if (code >= 96 && code <= 105) return 'Num ' + (code - 96);
    if (code >= 112 && code <= 123) return 'F' + (code - 111);
    return String(root.NGControls?.getLabel?.(code) ?? code);
  }

  function el(tag, name, className) {
    const node = root.document.createElement(tag);
    if (name !== undefined && name !== null) node.textContent = String(name);
    if (className) node.className = className;
    return node;
  }
  function heading(tag, content, cls) { return el(tag, content, cls); }

  function appendKey(row, code, lookup) {
    const mappings = lookup.get(code) || [];
    const key = el('div', null, 'ng-kv-key' + (mappings.length ? ' ng-kv-active' : '') +
      (code === 32 ? ' ng-kv-space' : '') + (code === 13 ? ' ng-kv-wide' : '') +
      (code === 16 ? ' ng-kv-wide' : '') + (code === 9 ? ' ng-kv-wide' : ''));
    key.dataset.keyCode = String(code);
    key.setAttribute('data-group', mappings[0]?.group || 'none');
    const top = el('kbd', keyName(code), 'ng-kv-key-label');
    top.dir = 'ltr';
    key.appendChild(top);
    if (mappings.length) {
      const bottom = el('span', mappings.map(x => x.symbol).join(' + '), 'ng-kv-key-action');
      bottom.dir = 'ltr';
      key.appendChild(bottom);
      key.setAttribute('aria-label', mappings.map(x => x.name + ': ' + x.keyboardLabel + ' / ' + x.gamepadLabel).join('; '));
      key.title = mappings.map(x => x.name + ' | ' + x.keyboardLabel + ' | ' + x.gamepadLabel).join('\n');
    } else {
      key.setAttribute('aria-label', keyName(code));
    }
    row.appendChild(key);
  }

  function makeKeyboard(data) {
    const lookup = new Map();
    for (const action of data.actions) {
      if (!Number.isInteger(action.keyCode)) continue;
      if (!lookup.has(action.keyCode)) lookup.set(action.keyCode, []);
      lookup.get(action.keyCode).push(action);
    }
    const area = el('div', null, 'ng-kv-board-wrap');
    const board = el('div', null, 'ng-kv-board');
    board.dir = 'ltr';
    board.setAttribute('role', 'img');
    board.setAttribute('aria-label', locale('keyboard_aria'));
    const main = el('div', null, 'ng-kv-main');
    for (const codes of ROWS) {
      const row = el('div', null, 'ng-kv-row');
      for (const code of codes) appendKey(row, code, lookup);
      main.appendChild(row);
    }
    board.appendChild(main);
    const navigation = el('div', null, 'ng-kv-nav');
    navigation.appendChild(heading('span', locale('arrows'), 'ng-kv-column-label'));
    for (const codes of ARROWS) {
      const row = el('div', null, 'ng-kv-row');
      for (const code of codes) appendKey(row, code, lookup);
      navigation.appendChild(row);
    }
    board.appendChild(navigation);
    const numpad = el('div', null, 'ng-kv-numpad');
    numpad.appendChild(heading('span', locale('numpad'), 'ng-kv-column-label'));
    for (const codes of NUMPAD) {
      const row = el('div', null, 'ng-kv-row');
      for (const code of codes) appendKey(row, code, lookup);
      numpad.appendChild(row);
    }
    board.appendChild(numpad);
    area.appendChild(board);
    const visible = new Set([...ROWS, ...ARROWS, ...NUMPAD].flat());
    const extra = [...lookup.keys()].filter(code => !visible.has(code)).sort((a, b) => a - b);
    if (extra.length) {
      const other = el('div', null, 'ng-kv-extras');
      other.appendChild(heading('span', locale('extra_keys'), 'ng-kv-column-label'));
      const extraRow = el('div', null, 'ng-kv-row');
      for (const code of extra) appendKey(extraRow, code, lookup);
      other.appendChild(extraRow);
      area.appendChild(other);
    }
    return area;
  }

  function makeMapping(data) {
    const section = el('div', null, 'ng-kv-mappings');
    const header = el('div', null, 'ng-kv-mappings-header');
    header.appendChild(heading('h4', locale('mapping_title')));
    header.appendChild(heading('span', locale('keyboard_to_gamepad'), 'ng-kv-mini-note'));
    section.appendChild(header);
    const list = el('div', null, 'ng-kv-mapping-list controls-grid');
    const ordered = [...PRIMARY, 'combo_ab', 'combo_abc', 'combo_cd'];
    for (const id of ordered) {
      const action = data.actions.find(x => x.id === id);
      if (!action) continue;
      const card = el('div', null, 'ng-kv-link control-item ng-kv-link-' + action.group);
      card.dataset.action = id;
      const identity = el('span', null, 'ng-kv-link-title control-action');
      const symbol = heading('span', action.symbol, 'control-symbol');
      symbol.setAttribute('aria-hidden', 'true');
      identity.append(symbol, heading('span', action.name));
      const bindings = el('span', null, 'ng-kv-link-pair control-key ng-kv-readonly');
      bindings.setAttribute('aria-label', action.keyboardLabel + ' / ' + action.gamepadLabel);
      const keyboard = el('kbd', action.keyboardLabel, 'ng-kv-link-keyboard');
      keyboard.dir = 'auto';
      const sign = el('span', '\u2194', 'ng-kv-link-arrow');
      sign.setAttribute('aria-hidden', 'true');
      const pad = el('span', action.gamepadLabel, 'ng-kv-link-pad');
      pad.dataset.padCode = action.gamepadCode || '';
      pad.dir = 'auto';
      if (action.native) pad.classList.add('ng-kv-link-native');
      bindings.append(keyboard, sign, pad);
      card.append(identity, bindings);
      list.appendChild(card);
    }
    section.appendChild(list);
    return section;
  }

  function render() {
    const current = $('ng-gamepad-visualizer-root');
    if (!current || !root.NGControls || !root.NGGamepadRemap) { host = null; return false; }
    host = current;
    const data = snapshot();
    if (!data) return false;
    host.replaceChildren();
    const shell = el('section', null, 'ng-kv-shell');
    shell.setAttribute('aria-label', locale('title'));
    const intro = el('div', null, 'ng-kv-heading global-controls-intro');
    const copy = el('div');
    copy.append(heading('h3', locale('title')), heading('p', locale('description'), 'ng-kv-desc'));
    const badge = el('span', locale('live'), 'ng-kv-live-badge control-source-badge');
    badge.setAttribute('aria-label', locale('live'));
    intro.append(copy, badge);
    shell.appendChild(intro);
    const tabs = el('div', null, 'ng-kv-tabs player-control-tabs');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', locale('choose_player'));
    for (const p of [0, 1]) {
      const button = el('button', locale('player' + (p + 1)), 'ng-kv-tab');
      button.type = 'button';
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', String(player === p));
      button.dataset.player = String(p);
      button.addEventListener('click', () => {
        player = p;
        render();
        if (typeof root.CustomEvent === 'function')
          root.dispatchEvent?.(new root.CustomEvent('ng-gamepad-visualizer-player-changed', { detail: { player: p } }));
        host?.querySelector?.('[data-player="' + p + '"]')?.focus?.();
      });
      tabs.appendChild(button);
    }
    shell.appendChild(tabs);
    const legend = el('div', null, 'ng-kv-legend');
    for (const type of ['movement', 'gameplay', 'system', 'combo']) {
      const token = el('span', locale('legend_' + type), 'ng-kv-legend-item ng-kv-legend-' + type);
      legend.appendChild(token);
    }
    shell.appendChild(legend);
    shell.appendChild(makeKeyboard(data));
    shell.appendChild(makeMapping(data));
    shell.appendChild(heading('p', locale(data.native ? 'native_hint' : 'saved_hint'), 'ng-kv-footer'));
    host.appendChild(shell);
    return true;
  }

  // Settings replaces its active card on navigation; always target the currently mounted host.
  function mount() {
    if (!$('ng-gamepad-visualizer-root')) { host = null; return false; }
    return render();
  }
  function refresh() {
    if (host && $('ng-gamepad-visualizer-root') === host) render();
  }
  root.addEventListener?.('ng-global-controls-changed', refresh);
  root.addEventListener?.('ng-gamepad-remap-changed', refresh);
  root.addEventListener?.('ng-gamepad-remap-player-changed', event => {
    if (event?.detail?.player === 0 || event?.detail?.player === 1) {
      player = event.detail.player;
      refresh();
    }
  });
  root.addEventListener?.('storage', event => {
    if (event?.key === root.NGControls?.STORAGE_KEY ||
        event?.key === root.NGGamepadRemap?.STORAGE_KEY) refresh();
  });
  root.document?.addEventListener?.('ng-language-changed', refresh);
  root.NGGamepadKeyboardVisualizer = Object.freeze({ mount, snapshot, keyName, render });
})(window);
