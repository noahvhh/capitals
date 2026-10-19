/*
 * Capitals deck. A deck is plain data: items plus a description of how to
 * show them. Nothing in quiz.js or ui.js knows about capitals.
 */
(function (root) {
  var CA = root.CA = root.CA || {};
  CA.decks = CA.decks || {};

  var CONTINENTS = [
    { id: 'EU', label: 'Europe' },
    { id: 'AF', label: 'Africa' },
    { id: 'AS', label: 'Asia' },
    { id: 'AM', label: 'Americas' },
    { id: 'OC', label: 'Oceania' }
  ];

  var items = root.CA_DATA.countries.map(function (r) {
    return {
      id: r[0], iso: r[0], country: r[1], capital: r[2], continent: r[3],
      hard: !!r[4], note: r[5] || null, aka: r[6] || null
    };
  });

  CA.decks.capitals = {
    id: 'capitals',
    title: 'Capitals',
    tagline: 'Every country, its capital, its flag, its place on the map.',
    items: items,
    groupKey: 'continent',
    groups: CONTINENTS,
    hardKey: 'hard',
    // Shown with every question (above the prompt).
    media: [
      { type: 'flag', field: 'iso', label: 'country' },
      { type: 'map', field: 'iso', groupField: 'continent' }
    ],
    directions: [
      {
        id: 'forward', label: 'Country → Capital', short: 'Capital',
        prompt: { type: 'text', field: 'country', sub: 'aka' },
        answer: { type: 'text', field: 'capital', note: 'note' },
        speakPrompt: function (it) { return it.country; },
        speakAnswer: function (it) { return it.capital; }
      },
      {
        id: 'reverse', label: 'Capital → Country', short: 'Country',
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
