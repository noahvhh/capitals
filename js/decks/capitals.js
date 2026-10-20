/*
 * Capitals deck. A deck is plain data: items plus a description of how to
 * show them. Nothing in quiz.js or ui.js knows about capitals.
 *
 * Items carry their names in each language (item.en, item.es); the
 * fields the quiz shows (country, capital, note, aka) are copied from the
 * current language by setLanguage(), so progress, which is keyed by ISO
 * code, is shared between languages.
 */
(function (root) {
  var CA = root.CA = root.CA || {};
  CA.decks = CA.decks || {};

  var GROUP_LABELS = {
    en: { EU: 'Europe', AF: 'Africa', AS: 'Asia', AM: 'Americas', OC: 'Oceania' },
    es: { EU: 'Europa', AF: 'África', AS: 'Asia', AM: 'América', OC: 'Oceanía' }
  };
  var groups = ['EU', 'AF', 'AS', 'AM', 'OC'].map(function (id) { return { id: id, label: GROUP_LABELS.en[id] }; });

  var spanish = root.CA_DATA.es || {};
  var items = root.CA_DATA.countries.map(function (r) {
    var es = spanish[r[0]] || [];
    return {
      id: r[0], iso: r[0], continent: r[3], hard: !!r[4],
      en: { country: r[1], capital: r[2], note: r[5] || null, aka: r[6] || null },
      es: { country: es[0] || r[1], capital: es[1] || r[2], note: es[2] || r[5] || null, aka: es[3] || null },
      alt: { capital: es[4] || [] },
      country: r[1], capital: r[2], note: r[5] || null, aka: r[6] || null
    };
  });

  function setLanguage(lang) {
    var labels = GROUP_LABELS[lang] || GROUP_LABELS.en;
    groups.forEach(function (g) { g.label = labels[g.id]; });
    items.forEach(function (it) {
      var names = it[lang] || it.en;
      it.country = names.country; it.capital = names.capital;
      it.note = names.note; it.aka = names.aka;
    });
  }

  // Every answer accepted when typing a field, in either language.
  function accept(it, field) {
    var out = [it.en[field], it.es[field]];
    if (field === 'country') out.push(it.en.aka, it.es.aka);
    return out.concat(it.alt[field] || []).filter(Boolean);
  }

  CA.decks.capitals = {
    id: 'capitals',
    title: 'Capitals',
    items: items,
    groupKey: 'continent',
    groups: groups,
    hardKey: 'hard',
    setLanguage: setLanguage,
    accept: accept,
    // Shown with every question (above the prompt).
    media: [
      { type: 'flag', field: 'iso', label: 'country' },
      { type: 'map', field: 'iso', groupField: 'continent' }
    ],
    directions: [
      {
        id: 'forward',
        prompt: { type: 'text', field: 'country', sub: 'aka' },
        answer: { type: 'text', field: 'capital', note: 'note' },
        speakPrompt: function (it) { return it.country; },
        speakAnswer: function (it) { return it.capital; }
      },
      {
        id: 'reverse',
        prompt: { type: 'text', field: 'capital' },
        answer: { type: 'text', field: 'country', sub: 'aka', note: 'note' },
        // The flag and map would give the answer away.
        mediaOnReveal: true,
        speakPrompt: function (it) { return it.capital; },
        speakAnswer: function (it) { return it.country; }
      }
    ]
  };
})(window);
