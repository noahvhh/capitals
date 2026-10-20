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

  CA.quiz = { shuffle: shuffle, pool: pool, due: due, choices: choices, createSession: createSession };
})(window);
