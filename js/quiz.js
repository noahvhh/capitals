/*
 * Quiz logic. Knows nothing about capitals: it works on any deck whose
 * items have an `id`, optionally a group field (deck.groupKey) and a
 * difficulty flag (deck.hardKey). See README "Adding a deck".
 */
(function (root) {
  var CA = root.CA = root.CA || {};

  // An item is due for review once it has been missed, and stays due
  // until right answers wear its miss score (s) down below DUE. Each miss
  // adds 1 and each right answer halves it, so one miss takes two right
  // answers to clear, two misses take three.
  var DUE = 0.3;

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // filter: { groups: [ids] | null, difficulty: 'easy' | 'hard' | 'all' }
  function pool(deck, filter) {
    filter = filter || {};
    return deck.items.filter(function (it) {
      if (filter.groups && filter.groups.length && deck.groupKey &&
          filter.groups.indexOf(it[deck.groupKey]) === -1) return false;
      if (deck.hardKey && filter.difficulty === 'hard' && !it[deck.hardKey]) return false;
      if (deck.hardKey && filter.difficulty === 'easy' && it[deck.hardKey]) return false;
      return true;
    });
  }

  // Items due for review, worst first (most missed, then most recent).
  //   stats  function(itemId) -> { r, w, s, t } | null
  function due(deck, stats) {
    return deck.items
      .map(function (it) { return { it: it, st: stats(it.id) }; })
      .filter(function (x) { return x.st && x.st.s >= DUE; })
      .sort(function (a, b) { return (b.st.s - a.st.s) || (b.st.t - a.st.t); })
      .map(function (x) { return x.it; });
  }

  // n options for a multiple-choice question: the right answer plus others
  // from the same group where there are enough, all different, shuffled.
  function choices(deck, item, field, n) {
    var g = deck.groupKey, same = [], rest = [], picks = [String(item[field])];
    deck.items.forEach(function (it) {
      if (it !== item) (g && it[g] === item[g] ? same : rest).push(it);
    });
    var pool = shuffle(same).concat(shuffle(rest));
    for (var i = 0; i < pool.length && picks.length < n; i++) {
      var v = String(pool[i][field]);
      if (picks.indexOf(v) === -1) picks.push(v);
    }
    return shuffle(picks);
  }

  function pickDirection(deck, setting) {
    var ids = deck.directions.map(function (d) { return d.id; });
    if (setting === 'mixed') return ids[Math.floor(Math.random() * ids.length)];
    return ids.indexOf(setting) >= 0 ? setting : ids[0];
  }

  /*
   * createSession(opts): asks each of opts.items once, in random order.
   *   deck       deck definition
   *   items      the items to ask
   *   direction  a direction id or 'mixed' (chosen per question)
   *   record     function(itemId, correct)
   */
  function createSession(opts) {
    var order = shuffle(opts.items);
    var total = order.length;
    var history = [];
    var index = -1;
    var current = null;

    return {
      get index() { return index; },
      get total() { return total; },
      get current() { return current; },
      get history() { return history; },
      next: function () {
        if (index + 1 >= total) { current = null; return null; }
        index++;
        current = { item: order[index], direction: pickDirection(opts.deck, opts.direction), graded: null };
        return current;
      },
      grade: function (correct) {
        if (!current || current.graded !== null) return;
        current.graded = !!correct;
        opts.record(current.item.id, !!correct);
        history.push(current);
      },
      skip: function () {
        // Used by hands-free mode: seen but not scored.
        if (current && current.graded === null) history.push(current);
      }
    };
  }

  /* ---------- typed answers ---------- */

  // Lower case, no accents or punctuation, "St" read as "Saint", and a
  // leading article dropped, so "el cairo", "Cairo" and "CAIRO" all match.
  function normalize(s) {
    return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[’'`ʻ.]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim()
      .replace(/\bst\b/g, 'saint').replace(/^(the|el|la|los|las) /, '');
  }

  // Every normalised form of the accepted answers, including the part
  // before a comma ("Washington, D.C.") or without brackets.
  function forms(answers) {
    var out = [];
    answers.forEach(function (a) {
      [a, a.split(',')[0], a.replace(/\(.*?\)/g, '')].forEach(function (v) {
        v = normalize(v);
        if (v && out.indexOf(v) === -1) out.push(v);
      });
    });
    return out;
  }

  function accepted(deck, item, field) {
    return deck.accept ? deck.accept(item, field) : [String(item[field])];
  }

  // normalised answer -> ids of the items it belongs to, per field.
  var owners = {};
  function ownersOf(deck, field) {
    var key = deck.id + ':' + field;
    if (!owners[key]) {
      var map = owners[key] = {};
      deck.items.forEach(function (it) {
        forms(accepted(deck, it, field)).forEach(function (f) { (map[f] = map[f] || []).push(it.id); });
      });
    }
    return owners[key];
  }

  // Edit distance where swapping two neighbouring letters counts as one.
  function distance(a, b) {
    var older = null, prev = [], cur, i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (older && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], older[j - 2] + 1);
      }
      older = prev; prev = cur;
    }
    return prev[b.length];
  }

  // Typos allowed: none up to 4 letters, one up to 7, then two.
  function tolerance(n) { return n <= 4 ? 0 : n <= 7 ? 1 : 2; }

  /*
   * check(deck, item, field, input) -> { ok, exact, empty }
   * Right if the input matches any accepted answer, in any language, give
   * or take a typo. Typing another item's answer exactly is always wrong,
   * so "Niger" isn't taken as a typo for "Nigeria".
   */
  function check(deck, item, field, input) {
    var x = normalize(input);
    if (!x) return { ok: false, empty: true };
    var targets = forms(accepted(deck, item, field));
    if (targets.indexOf(x) >= 0) return { ok: true, exact: true };
    var mine = ownersOf(deck, field)[x];
    if (mine && mine.indexOf(item.id) === -1) return { ok: false };
    for (var i = 0; i < targets.length; i++) {
      if (distance(x, targets[i]) <= tolerance(targets[i].length)) return { ok: true, exact: false };
    }
    return { ok: false };
  }

  CA.quiz = { shuffle: shuffle, pool: pool, due: due, choices: choices, check: check, normalize: normalize, createSession: createSession };
})(window);
