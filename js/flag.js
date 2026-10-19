/*
 * Flags as emoji built from the ISO code (two regional indicator letters),
 * so they need no files or network. Platforms without flag emoji (notably
 * Windows) get a neat code badge instead.
 */
(function (root) {
  var CA = root.CA = root.CA || {};

  function emoji(code) {
    return String.fromCodePoint.apply(null, code.toUpperCase().split('').map(function (c) {
      return 0x1f1e6 + c.charCodeAt(0) - 65;
    }));
  }

  var supported = null;
  function supportsFlags() {
    if (supported !== null) return supported;
    try {
      var c = document.createElement('canvas');
      c.width = c.height = 16;
      var ctx = c.getContext('2d');
      ctx.textBaseline = 'top';
      ctx.font = '16px sans-serif';
      ctx.fillText(emoji('FR'), 0, 0);
      var d = ctx.getImageData(0, 0, 16, 16).data, colored = 0;
      for (var i = 0; i < d.length; i += 4) {
        if (d[i + 3] && (Math.abs(d[i] - d[i + 1]) > 40 || Math.abs(d[i + 1] - d[i + 2]) > 40)) colored++;
      }
      supported = colored > 8;
    } catch (e) { supported = true; }
    return supported;
  }

  CA.flag = {
    emoji: emoji,
    render: function (code, label) {
      var el = document.createElement('div');
      el.className = 'flag';
      el.setAttribute('role', 'img');
      el.setAttribute('aria-label', 'Flag' + (label ? ' of ' + label : ''));
      if (supportsFlags()) {
        el.textContent = emoji(code);
      } else {
        el.classList.add('flag-fallback');
        el.textContent = code.toUpperCase();
      }
      return el;
    }
  };
})(window);
