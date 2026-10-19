/*
 * App config. To study a different deck, register it in js/decks/ and
 * change `deck` below (and add its script tag to index.html).
 */
(function (root) {
  var CA = root.CA = root.CA || {};
  CA.config = {
    deck: 'capitals',
    reviewLengths: [10, 20, 40],
    // Map outlines are loaded after the home screen has painted.
    mapData: 'data/map.js'
  };
})(window);
