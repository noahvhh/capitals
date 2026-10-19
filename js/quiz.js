/*
 * Quiz logic. Knows nothing about capitals: it works on any deck whose
 * items have an `id`, optionally a group field (deck.groupKey) and a
 * difficulty flag (deck.hardKey). See README "Adding a deck".
 */
(function (root) {
  var CA = root.CA = root.CA || {};

  // Weight for the mistakes-weighted review.
  //   never seen      -> 1.0 (middle)
  //   always right    -> 0.2 (lowest)
  //   missed          -> up to 3.0, decaying as the miss score halves on
  //                      each correct answer
  var W_UNSEEN = 1, W_MIN = 0.2, W_MAX = 3;
  function weight(stats) {
    if (!stats || stats.r + stats.w === 0) return W_UNSEEN;
    var s = stats.s || 0;
    return W_MIN + (W_MAX - W_MIN) * (s / (s + 1));
  }

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

  function pickDirection(deck, setting) {
    var ids = deck.directions.map(function (d) { return d.id; });
    if (setting === 'mixed') return ids[Math.floor(Math.random() * ids.length)];
    return ids.indexOf(setting) >= 0 ? setting : ids[0];
  }

  /*
   * createSession(opts)
   *   deck       deck definition
   *   items      the pool to ask from
   *   mode       'weighted' (review) or 'sequence' (each item once, shuffled)
   *   length     number of questions for 'weighted'
   *   direction  a direction id or 'mixed' (chosen per question)
   *   stats      function(itemId) -> { r, w, s } | null
   *   record     function(itemId, correct)
   */
  function createSession(opts) {
    var items = opts.items;
    var total = opts.mode === 'weighted' ? Math.min(opts.length || 20, Math.max(items.length, 1) * 3) : items.length;
    var order = opts.mode === 'weighted' ? null : shuffle(items);
    var recent = [];
    var history = [];
    var index = -1;
    var current = null;

    function weightedPick() {
      var avoid = Math.min(3, items.length - 1);
      var blocked = recent.slice(-avoid);
      var candidates = items.filter(function (it) { return blocked.indexOf(it.id) === -1; });
      var weights = candidates.map(function (it) { return weight(opts.stats(it.id)); });
      var sum = weights.reduce(function (a, b) { return a + b; }, 0);
      var x = Math.random() * sum;
      for (var i = 0; i < candidates.length; i++) {
        x -= weights[i];
        if (x <= 0) return candidates[i];
      }
      return candidates[candidates.length - 1];
    }

    return {
      get index() { return index; },
      get total() { return total; },
      get current() { return current; },
      get history() { return history; },
      next: function () {
        if (index + 1 >= total || !items.length) { current = null; return null; }
        index++;
        var item = order ? order[index] : weightedPick();
        recent.push(item.id);
        current = { item: item, direction: pickDirection(opts.deck, opts.direction), graded: null };
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

  CA.quiz = { weight: weight, shuffle: shuffle, pool: pool, createSession: createSession };
})(window);
