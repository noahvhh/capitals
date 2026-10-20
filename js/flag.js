/*
 * Flags as emoji built from the ISO code (two regional indicator letters),
 * so they need no image files. iPhone, Mac and Android draw them with
 * their own emoji font; Windows has no flag emoji, so the stylesheet falls
 * back to a bundled Twemoji flag font there (see .flag in styles.css).
 */
(function (root) {
  var CA = root.CA = root.CA || {};

  function emoji(code) {
    return String.fromCodePoint.apply(null, code.toUpperCase().split('').map(function (c) {
      return 0x1f1e6 + c.charCodeAt(0) - 65;
    }));
  }

  CA.flag = {
    emoji: emoji,
    render: function (code, label) {
      var el = document.createElement('div');
      el.className = 'flag';
      el.setAttribute('role', 'img');
      el.setAttribute('aria-label', 'Flag' + (label ? ' of ' + label : ''));
      el.textContent = emoji(code);
      return el;
    }
  };
})(window);
