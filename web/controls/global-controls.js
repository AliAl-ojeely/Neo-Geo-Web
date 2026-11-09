/*
 * Neo-Geo Web Port
 * Global Keyboard Controls — Custom V2
 *
 * One global keyboard profile for both players.
 *
 * This module does NOT modify ROMs, BIOS, FBNeo,
 * EmulatorJS vendor files, or game save states.
 *
 * Macro keys press multiple RetroPad inputs
 * simultaneously in the same browser event.
 *
 * Player 1:
 * Q = A + B
 * E = C + D
 * R = A + B + C
 * W = Unassigned
 */

'use strict';

(() => {
  const STORAGE_KEY = 'neogeo-global-controls-v2';
  const OLD_STORAGE_KEY = 'neogeo-global-controls-v1';

  // --------------------------------------------------
  // 1. Logical Neo Geo actions
  // --------------------------------------------------

  const ACTIONS = Object.freeze([
    {
      id: 'up',
      get label() {
        return NGI18n.t('global_controls.up_jump');
      },
      symbol: '↑',
      retroId: 4,
      group: 'movement'
    },
    {
      id: 'down',
      get label() {
        return NGI18n.t('global_controls.down_crouch');
      },
      symbol: '↓',
      retroId: 5,
      group: 'movement'
    },
    {
      id: 'left',
      get label() {
        return NGI18n.t('global_controls.left');
      },
      symbol: '←',
      retroId: 6,
      group: 'movement'
    },
    {
      id: 'right',
      get label() {
        return NGI18n.t('global_controls.right');
      },
      symbol: '→',
      retroId: 7,
      group: 'movement'
    },

    // Punch/kick names describe KOF 98.
    // Other games may use the buttons differently.

    {
      id: 'a',
      get label() {
        return NGI18n.t('global_controls.neo_geo_a_light_punch_kof_98');
      },
      symbol: 'A',
      retroId: 0,
      group: 'buttons'
    },
    {
      id: 'b',
      get label() {
        return NGI18n.t('global_controls.neo_geo_b_light_kick_kof_98');
      },
      symbol: 'B',
      retroId: 8,
      group: 'buttons'
    },
    {
      id: 'c',
      get label() {
        return NGI18n.t('global_controls.neo_geo_c_heavy_punch_kof_98');
      },
      symbol: 'C',
      retroId: 1,
      group: 'buttons'
    },
    {
      id: 'd',
      get label() {
        return NGI18n.t('global_controls.neo_geo_d_heavy_kick_kof_98');
      },
      symbol: 'D',
      retroId: 9,
      group: 'buttons'
    },

    // Simultaneous multi-button macros.

    {
      id: 'combo_ab',
      get label() {
        return NGI18n.t('global_controls.combo_a_b_simultaneous');
      },
      symbol: 'A+B',
      retroIds: [0, 8],
      group: 'combos'
    },
    {
      id: 'combo_abc',
      get label() {
        return NGI18n.t('global_controls.combo_a_b_c_simultaneous');
      },
      symbol: 'A+B+C',
      retroIds: [0, 8, 1],
      group: 'combos'
    },
    {
      id: 'combo_cd',
      get label() {
        return NGI18n.t('global_controls.combo_c_d_simultaneous');
      },
      symbol: 'C+D',
      retroIds: [1, 9],
      group: 'combos'
    },

    {
      id: 'start',
      get label() {
        return NGI18n.t('global_controls.start_start_game');
      },
      symbol: 'START',
      retroId: 3,
      group: 'system'
    },
    {
      id: 'coin',
      get label() {
        return NGI18n.t('global_controls.coin_select_add_credit');
      },
      symbol: 'COIN',
      retroId: 2,
      group: 'system'
    }
  ]);

  // --------------------------------------------------
  // 2. Player 1 — Default keyboard controls
  // --------------------------------------------------

  const PLAYER_ONE = Object.freeze({
    up: 38,
    down: 40,
    left: 37,
    right: 39,

    // Main Neo Geo buttons.
    a: 65, // A
    b: 83, // S
    c: 68, // D
    d: 70, // F

    // Corrected combos:
    combo_ab: 81, // Q = A + S
    combo_abc: 82, // R = A + S + D
    combo_cd: 69, // E = D + F

    start: 49, // 1
    coin: 51 // 3
  });

  // --------------------------------------------------
  // 3. Player 2 — Default keyboard controls
  // --------------------------------------------------

  const PLAYER_TWO = Object.freeze({
    up: 104, // NumPad 8
    down: 98, // NumPad 2
    left: 100, // NumPad 4
    right: 102, // NumPad 6

    a: 74, // J
    b: 75, // K
    c: 76, // L
    d: 80, // P

    combo_ab: 89, // Y
    combo_abc: 85, // U
    combo_cd: 73, // I

    start: 50, // 2
    coin: 52 // 4
  });

  // W and O are intentionally unassigned.

  const DEFAULTS = Object.freeze({
    schema: 2,
    source: 'Neo-Geo Custom (user layout: KOF98)',
    players: {
      0: PLAYER_ONE,
      1: PLAYER_TWO
    }
  });

  // --------------------------------------------------
  // 4. Keyboard labels
  // --------------------------------------------------

  const KEY_LABELS = {
    8: 'Backspace',
    9: 'Tab',
    13: 'Enter',
    16: 'Shift',
    17: 'Ctrl',
    18: 'Alt',
    19: 'Pause',
    20: 'Caps Lock',
    27: 'Esc',
    32: 'Space',

    33: 'Page Up',
    34: 'Page Down',
    35: 'End',
    36: 'Home',

    37: NGI18n.t('global_controls.left_arrow'),
    38: NGI18n.t('global_controls.up_arrow'),
    39: NGI18n.t('global_controls.right_arrow'),
    40: NGI18n.t('global_controls.down_arrow'),

    45: 'Insert',
    46: 'Delete',

    106: 'NumPad ×',
    107: 'NumPad +',
    109: 'NumPad −',
    110: 'NumPad .',
    111: 'NumPad /',

    144: 'Num Lock',
    145: 'Scroll Lock',

    186: NGI18n.t('global_controls.semicolon'),
    187: NGI18n.t('global_controls.equals'),
    188: NGI18n.t('global_controls.comma'),
    189: NGI18n.t('global_controls.hyphen'),
    190: NGI18n.t('global_controls.period'),
    191: NGI18n.t('global_controls.slash'),
    192: 'Accent (`)',
    219: '[',
    220: '\\',
    221: ']',
    222: NGI18n.t('global_controls.quote')
  };

  for (let k = 48; k <= 57; k++) {
    KEY_LABELS[k] = NGI18n.t('global_controls.digit') + ' ' + String.fromCharCode(k);
  }

  for (let k = 65; k <= 90; k++) {
    KEY_LABELS[k] = NGI18n.t('global_controls.key') + ' ' + String.fromCharCode(k);
  }

  for (let k = 96; k <= 105; k++) {
    KEY_LABELS[k] = 'NumPad ' + (k - 96);
  }

  for (let k = 112; k <= 123; k++) {
    KEY_LABELS[k] = 'F' + (k - 111);
  }

  const RESERVED = new Set([9, 16, 17, 18, 19, 20, 27, 91, 92, 93]);

  // Copy the JSON-compatible profile so callers cannot mutate the defaults.
  const clone = obj => JSON.parse(JSON.stringify(obj));

  // Resolve a stored key code to its display label, including unknown codes.
  const getLabel = code => {
    const value = Number(code);
    if (value >= 48 && value <= 57)
      return NGI18n.t('common.digitNamed', { digit: String.fromCharCode(value) });
    if (value >= 65 && value <= 90)
      return NGI18n.t('common.keyNamed', { key: String.fromCharCode(value) });
    return KEY_LABELS[value]
      ? NGI18n.translateText(KEY_LABELS[value])
      : NGI18n.t('common.unknownKey', { code: String(code) });
  };

  // --------------------------------------------------
  // 5. Validation
  // --------------------------------------------------

  // Accept supported integer key codes except reserved browser and modifier keys.
  function validCode(value) {
    return Number.isInteger(value) && Object.hasOwn(KEY_LABELS, value) && !RESERVED.has(value);
  }

  // Require every action in one player map to have a valid, distinct key.
  function noDuplicates(map) {
    const seen = new Set();

    return ACTIONS.every(action => {
      const value = map[action.id];

      if (!validCode(value) || seen.has(value)) {
        return false;
      }

      seen.add(value);
      return true;
    });
  }

  // Merge valid schema-2 player maps into defaults; discard maps with key conflicts.
  function normalize(raw) {
    const result = clone(DEFAULTS);

    if (!raw || raw.schema !== 2 || !raw.players || typeof raw.players !== 'object') {
      return result;
    }

    for (const player of ['0', '1']) {
      const from = raw.players[player];

      if (!from || typeof from !== 'object') {
        continue;
      }

      const combined = {
        ...result.players[player]
      };

      for (const action of ACTIONS) {
        const candidate = Number(from[action.id]);

        if (validCode(candidate)) {
          combined[action.id] = candidate;
        }
      }

      if (noDuplicates(combined)) {
        result.players[player] = combined;
      }
    }

    return result;
  }

  // --------------------------------------------------
  // 6. Profile storage
  // --------------------------------------------------

  // Read and normalize the saved profile, falling back to defaults on storage or JSON errors.
  function load() {
    try {
      return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'));
    } catch {
      return clone(DEFAULTS);
    }
  }

  // Persist a normalized profile and notify listeners; return false if either operation throws.
  function save(raw) {
    const value = normalize(raw);

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));

      window.dispatchEvent?.(new CustomEvent('ng-global-controls-changed'));

      return true;
    } catch {
      return false;
    }
  }

  // Reject unsupported or already assigned keys across both players before saving the binding.
  function setKey(player, actionName, keyCode) {
    const playerId = String(player);

    const action = ACTIONS.find(a => a.id === actionName);

    const code = Number(keyCode);

    if (!['0', '1'].includes(playerId) || !action) {
      return {
        ok: false,
        error: 'INVALID_ACTION'
      };
    }

    if (!validCode(code)) {
      return {
        ok: false,
        error: 'UNSUPPORTED_KEY'
      };
    }

    const state = load();

    for (const p of ['0', '1']) {
      for (const a of ACTIONS) {
        if (a.id === actionName && p === playerId) {
          continue;
        }

        if (state.players[p][a.id] === code) {
          return {
            ok: false,
            error: 'KEY_CONFLICT',
            conflict:
              (p === playerId
                ? NGI18n.t('global_controls.same_player')
                : NGI18n.t('global_controls.other_player')) +
              ' — ' +
              a.label
          };
        }
      }
    }

    state.players[playerId][actionName] = code;

    return save(state)
      ? { ok: true }
      : {
          ok: false,
          error: 'STORAGE_UNAVAILABLE'
        };
  }

  // --------------------------------------------------
  // 7. EmulatorJS integration
  // --------------------------------------------------

  // Apply keyboard bindings while preserving gamepad mappings and register focus-loss releases.
  function applyToEmulator(emulator) {
    if (!emulator?.controls || !emulator?.defaultControllers) {
      return false;
    }

    const profile = load();

    const gamepad = {
      0: 'BUTTON_2',
      8: 'BUTTON_1',
      1: 'BUTTON_4',
      9: 'BUTTON_3',

      4: 'DPAD_UP',
      5: 'DPAD_DOWN',
      6: 'DPAD_LEFT',
      7: 'DPAD_RIGHT',

      2: 'SELECT',
      3: 'START'
    };

    for (const p of [0, 1]) {
      emulator.controls[p] ||= {};
      emulator.defaultControllers[p] ||= {};

      for (const action of ACTIONS) {
        // Macro actions are handled by handleKeyChange.
        if (action.retroId === undefined) {
          continue;
        }

        const retroId = action.retroId;

        for (const target of [emulator.controls[p], emulator.defaultControllers[p]]) {
          target[retroId] ||= {};

          target[retroId].value = profile.players[p][action.id];

          if (target[retroId].value2 === undefined) {
            target[retroId].value2 = gamepad[retroId];
          }
        }
      }

      // Disable unwanted keyboard inputs on IDs 10–29
      // while preserving existing gamepad value2 mappings.

      for (const target of [emulator.controls[p], emulator.defaultControllers[p]]) {
        for (let retroId = 10; retroId < 30; retroId++) {
          target[retroId] ||= {};
          target[retroId].value = 0;
        }
      }
    }

    emulator.setupKeys?.();
    emulator.checkGamepadInputs?.();

    releaseHeld(emulator);

    if (typeof window?.addEventListener === 'function' && !listeners.has(emulator)) {
      // Release gameplay inputs when focus leaves or Tab opens the pause interaction.
      const release = () => releaseHeld(emulator);

      window.addEventListener('blur', release);
      window.addEventListener('pagehide', release);

      window.addEventListener(
        'keydown',
        e => {
          if (e.key === 'Tab') {
            release();
          }
        },
        true
      );

      if (typeof document !== 'undefined') {
        // Hidden tabs must not retain pressed gameplay inputs.
        document.addEventListener('visibilitychange', () => {
          if (document.hidden) {
            release();
          }
        });
      }

      listeners.add(emulator);
    }

    return true;
  }

  // --------------------------------------------------
  // 8. Pressed-key state and macro handling
  // --------------------------------------------------

  // Each emulator has an isolated pressed-key state.
  // Overlapping macros never release a button
  // that is still held by another physical key.

  const inputStates = new WeakMap();
  const listeners = new WeakSet();

  const physicalActions = ACTIONS.filter(a => a.retroId !== undefined);

  const combos = ACTIONS.filter(a => a.retroIds);

  // Lazily allocate physical-key and emitted-button state for each emulator instance.
  function inputState(emu) {
    let state = inputStates.get(emu);

    if (!state) {
      state = {
        keys: new Set(),
        sent: new Map()
      };

      inputStates.set(emu, state);
    }

    return state;
  }

  // Emit only button-state transitions and track the inputs that need releasing.
  function send(emu, player, retroId, value) {
    const state = inputState(emu);
    const name = player + ':' + retroId;

    if ((state.sent.get(name) || 0) === value) {
      return;
    }

    emu.gameManager?.simulateInput?.(player, retroId, value);

    if (value) {
      state.sent.set(name, value);
    } else {
      state.sent.delete(name);
    }
  }

  // Clear physical keys and send releases for every tracked pressed RetroPad input.
  function releaseHeld(emu) {
    if (!emu) {
      return;
    }

    const state = inputState(emu);

    state.keys.clear();

    for (const [key] of Array.from(state.sent)) {
      const [player, retroId] = key.split(':').map(Number);

      send(emu, player, retroId, 0);
    }
  }

  // --------------------------------------------------
  // 9. Browser key code translation
  // --------------------------------------------------

  // Prefer physical letter, digit, and numpad codes before falling back to legacy key codes.
  function inputCode(event) {
    const code = event.code || '';

    const np = /^Numpad([0-9])$/.exec(code);

    if (np) {
      return 96 + Number(np[1]);
    }

    const letter = /^Key([A-Z])$/.exec(code);

    if (letter) {
      return letter[1].charCodeAt(0);
    }

    const digit = /^Digit([0-9])$/.exec(code);

    if (digit) {
      return digit[1].charCodeAt(0);
    }

    const number = Number(event.keyCode ?? event.which);

    return Number.isInteger(number) ? number : -1;
  }

  // --------------------------------------------------
  // 10. Keyboard input handling
  // --------------------------------------------------

  // Handle assigned gameplay keys outside menus and text fields; consume repeats without resending input.
  function handleKeyChange(emu, event) {
    if (!emu || !event || !['keydown', 'keyup'].includes(event.type)) {
      return false;
    }

    const code = inputCode(event);
    const profile = load();

    const isAssigned = ['0', '1'].some(p =>
      ACTIONS.some(a => profile.players[p][a.id] === code)
    );

    if (!isAssigned) {
      return false;
    }

    if (!emu.started || !emu.gameManager?.simulateInput) {
      releaseHeld(emu);
      return false;
    }

    const popupVisible =
      emu.controlPopup?.parentElement?.parentElement?.getAttribute?.('hidden') === null;

    const settingsVisible =
      emu.settingsMenu?.style?.display !== 'none' && !!emu.settingsMenu?.style;

    const inPopup = typeof emu.isPopupOpen === 'function' && emu.isPopupOpen();

    const keyboardMode = emu.getSettingValue?.('keyboardInput') === 'enabled';

    const typingTarget = event.target?.closest?.(
      'input,textarea,select,[contenteditable="true"]'
    );

    if (
      popupVisible ||
      settingsVisible ||
      inPopup ||
      keyboardMode ||
      typingTarget ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey
    ) {
      releaseHeld(emu);
      return false;
    }

    event.preventDefault?.();

    const state = inputState(emu);

    if (event.repeat) {
      return true;
    }

    if (event.type === 'keydown') {
      state.keys.add(code);
    } else {
      state.keys.delete(code);
    }

    for (const p of [0, 1]) {
      const map = profile.players[p];

      for (const action of physicalActions) {
        const held = state.keys.has(map[action.id]);

        // A button stays pressed while any physical binding or overlapping macro holds it.
        const viaMacro = combos.some(
          combo => state.keys.has(map[combo.id]) && combo.retroIds.includes(action.retroId)
        );

        send(emu, p, action.retroId, held || viaMacro ? 1 : 0);
      }
    }

    return true;
  }

  // --------------------------------------------------
  // 11. Import and export
  // --------------------------------------------------

  // Serialize the current normalized profile with an export timestamp.
  function exportJSON() {
    return JSON.stringify(
      {
        ...load(),
        exported_at: new Date().toISOString()
      },
      null,
      2
    );
  }

  // Validate schema and each binding before saving; return a structured validation or storage error.
  function importJSON(json) {
    let obj;

    try {
      obj = JSON.parse(json);
    } catch {
      return {
        ok: false,
        error: 'INVALID_JSON'
      };
    }

    if (!obj || obj.schema !== 2 || !obj.players?.[0] || !obj.players?.[1]) {
      return {
        ok: false,
        error: 'INVALID_PROFILE'
      };
    }

    const clean = normalize(obj);

    for (const p of ['0', '1']) {
      for (const action of ACTIONS) {
        if (
          !validCode(Number(obj.players[p][action.id])) ||
          Number(obj.players[p][action.id]) !== clean.players[p][action.id]
        ) {
          return {
            ok: false,
            error: 'INVALID_OR_DUPLICATE_KEY'
          };
        }
      }
    }

    return save(clean)
      ? { ok: true }
      : {
          ok: false,
          error: 'STORAGE_UNAVAILABLE'
        };
  }

  // --------------------------------------------------
  // 12. Public API
  // --------------------------------------------------

  window.NGControls = Object.freeze({
    STORAGE_KEY,
    OLD_STORAGE_KEY,
    ACTIONS,
    DEFAULTS,

    load,
    save,
    setKey,
    getLabel,

    applyToEmulator,
    handleKeyChange,
    releaseHeld,

    exportJSON,
    importJSON,

    // Save the default profile through the same persistence and notification path.
    reset: () => save(DEFAULTS)
  });
})();
