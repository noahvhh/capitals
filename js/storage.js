/*
 * Storage: settings and per-item progress.
 *
 * The UI only talks to CA.store. Persistence goes through an adapter with
 * two methods, read() -> object|null and write(object), so localStorage can
 * later be swapped for a backend or account sync by calling
 * CA.store.useAdapter(myAdapter) before CA.store.init().
 *
 * Shape (version 1):
 *   { version: 1,
 *     settings: { ... },
 *     decks: { <deckId>: { items: { <itemId>: { r, w, s, t } } } } }
 *   r = times right, w = times wrong, s = miss score (rises on a miss,
 *   halves on a hit), t = last seen (ms since epoch)
 */
(function (root) {
  var CA = root.CA = root.CA || {};

  var VERSION = 1;
  var KEY_PREFIX = 'capitals-app:v';
  var KEY = KEY_PREFIX + VERSION;

  var DEFAULT_SETTINGS = {
    direction: 'forward',     // forward | reverse | mixed
    answer: 'type',           // type | choices (pick from 4) | self (reveal, then Got it / Missed)
    language: null,           // en | es; null = the browser's language
    mediaBeforeReveal: false,
    reviewLength: 20,
    voice: false,
    rate: 1,
    lang: 'en-GB',
    autoplay: false,
    thinkSeconds: 5,
    mixedGroups: [],
    mixedDifficulty: 'all'
  };

  // Each entry upgrades data from version i+1 to i+2. Add one when the
  // shape changes, and bump VERSION.
  var MIGRATIONS = [];

  function localAdapter() {
    function safe(fn, fallback) {
      try { return fn(); } catch (e) { return fallback; }
    }
    return {
      read: function () {
        return safe(function () {
          var raw = localStorage.getItem(KEY);
          if (raw) return JSON.parse(raw);
          // Look for an older version to migrate.
          for (var v = VERSION - 1; v >= 1; v--) {
            var old = localStorage.getItem(KEY_PREFIX + v);
            if (old) return JSON.parse(old);
          }
          return null;
        }, null);
      },
      write: function (data) {
        return safe(function () { localStorage.setItem(KEY, JSON.stringify(data)); return true; }, false);
      }
    };
  }

  var adapter = localAdapter();
  var state = null;
  var listeners = [];
  var writeTimer = null;

  function fresh() {
    return { version: VERSION, settings: Object.assign({}, DEFAULT_SETTINGS), decks: {} };
  }

  function migrate(data) {
    if (!data || typeof data !== 'object') return fresh();
    var v = data.version || 1;
    while (v < VERSION) {
      data = MIGRATIONS[v - 1](data);
      v++;
    }
    data.version = VERSION;
    data.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings || {});
    // `answerMode` (choices | self) became `answer`, with typing as the
    // new default; only an explicit self-check choice carries over.
    if ('answerMode' in data.settings) {
      if (data.settings.answerMode === 'self') data.settings.answer = 'self';
      delete data.settings.answerMode;
    }
    data.decks = data.decks || {};
    return data;
  }

  function persist() {
    clearTimeout(writeTimer);
    writeTimer = setTimeout(function () { adapter.write(state); }, 150);
  }
  function flush() {
    clearTimeout(writeTimer);
    if (state) adapter.write(state);
  }
  function emit() { listeners.forEach(function (fn) { fn(state); }); }

  function deck(id) {
    if (!state.decks[id]) state.decks[id] = { items: {} };
    return state.decks[id];
  }

  CA.store = {
    useAdapter: function (a) { adapter = a; },
    init: function () {
      state = migrate(adapter.read());
      adapter.write(state);
      root.addEventListener('pagehide', flush);
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') flush();
      });
      return state;
    },
    onChange: function (fn) { listeners.push(fn); },

    getSettings: function () { return state.settings; },
    setSetting: function (key, value) {
      state.settings[key] = value;
      persist(); emit();
    },

    getItem: function (deckId, itemId) {
      return deck(deckId).items[itemId] || null;
    },
    record: function (deckId, itemId, correct) {
      var items = deck(deckId).items;
      var it = items[itemId] || (items[itemId] = { r: 0, w: 0, s: 0, t: 0 });
      if (correct) { it.r++; it.s = it.s * 0.5; if (it.s < 0.05) it.s = 0; }
      else { it.w++; it.s = it.s + 1; }
      it.t = Date.now();
      persist(); emit();
      return it;
    },
    deckSummary: function (deckId) {
      var items = deck(deckId).items, seen = 0, r = 0, w = 0;
      Object.keys(items).forEach(function (k) {
        var it = items[k];
        if (it.r + it.w > 0) seen++;
        r += it.r; w += it.w;
      });
      return { seen: seen, right: r, wrong: w };
    },

    exportJSON: function () {
      flush();
      return JSON.stringify(Object.assign({ app: 'capitals', exportedAt: new Date().toISOString() }, state), null, 2);
    },
    importJSON: function (text) {
      var data = JSON.parse(text);
      if (!data || typeof data !== 'object' || !data.decks) throw new Error('Not a Capitals backup file.');
      if ((data.version || 1) > VERSION) throw new Error('This backup is from a newer version of the app.');
      delete data.app; delete data.exportedAt;
      state = migrate(data);
      flush(); emit();
    },
    reset: function () {
      var keep = state.settings;
      state = fresh();
      state.settings = keep;
      flush(); emit();
    }
  };
})(window);
