/*
 * Locator map: inline SVG, equirectangular, cropped above Antarctica.
 * Outlines come from data/map.js (generated from Natural Earth by
 * tools/build-map.mjs), loaded with a plain script tag so it also works
 * when the site is opened straight from a folder.
 */
(function (root) {
  var CA = root.CA = root.CA || {};
  var NS = 'http://www.w3.org/2000/svg';

  // Rough centres (map units) used when a country has no outline.
  var GROUP_CENTRES = {
    EU: [542, 89], AF: [556, 219], AS: [750, 136], AM: [278, 206], OC: [917, 275]
  };

  var loading = null;
  var instances = 0;
  function load() {
    if (root.CA_DATA && root.CA_DATA.map) return Promise.resolve(root.CA_DATA.map);
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = CA.config.mapData;
      s.async = true;
      s.onload = function () { resolve(root.CA_DATA.map); };
      s.onerror = function () { loading = null; reject(new Error('Map data failed to load')); };
      document.head.appendChild(s);
    });
    return loading;
  }

  function create(container) {
    var wrap = document.createElement('div');
    wrap.className = 'map';
    wrap.innerHTML = '<div class="map-glow" aria-hidden="true"></div><div class="map-label" aria-hidden="true"></div>';
    container.appendChild(wrap);
    var label = wrap.querySelector('.map-label');
    var uid = ++instances;
    var svg, zoomG, pinG, data, paths = {}, active = null, pending = null;

    function build(d) {
      data = d;
      svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', '0 0 ' + d.w + ' ' + d.h);
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', 'World map');
      var html =
        '<defs><linearGradient id="land-grad-' + uid + '" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="' + d.h + '">' +
        '<stop offset="0" stop-color="#6a8dd8" stop-opacity="0.34"/>' +
        '<stop offset="1" stop-color="#050505" stop-opacity="0.34"/>' +
        '</linearGradient></defs>' +
        '<g class="map-zoom"><g id="map-world-' + uid + '" fill="url(#land-grad-' + uid + ')"><path class="land other" d="' + d.other + '"/>';
      Object.keys(d.countries).forEach(function (k) {
        html += '<path class="land" data-id="' + k + '" d="' + d.countries[k].d + '"/>';
      });
      // Copies either side so zoomed views near the antimeridian (Fiji,
      // Tuvalu, Samoa...) can centre on the country instead of the edge.
      html += '</g><use href="#map-world-' + uid + '" x="' + (-d.w) + '"/><use href="#map-world-' + uid + '" x="' + d.w + '"/>';
      html += '</g><g class="map-pin" opacity="0"><circle class="pin-ring" r="11"/><circle class="pin-dot" r="9"/></g>';
      svg.innerHTML = html;
      zoomG = svg.querySelector('.map-zoom');
      pinG = svg.querySelector('.map-pin');
      svg.querySelectorAll('path[data-id]').forEach(function (p) { paths[p.getAttribute('data-id')] = p; });
      wrap.appendChild(svg);
      wrap.classList.add('ready');
      if (pending) { var p = pending; pending = null; show(p.id, p.group, p.groupLabel); }
    }

    function setView(cx, cy, k) {
      var W = data.w, H = data.h;
      var tx = k > 1 ? W / 2 - cx * k : 0;
      var ty = Math.min(0, Math.max(H - H * k, H / 2 - cy * k));
      zoomG.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + k + ')';
      return [cx * k + tx, cy * k + ty];
    }

    function show(id, group, groupLabel) {
      if (!data) { pending = { id: id, group: group, groupLabel: groupLabel }; return; }
      if (active) active.classList.remove('on');
      var c = data.countries[id];
      var pt, k = 1;
      if (c) {
        active = paths[id];
        active.classList.add('on');
        // Zoom in on small countries so the pin isn't lost.
        var size = Math.max(c.b[2] - c.b[0], (c.b[3] - c.b[1]) * 1.4, 0.5);
        k = Math.max(1, Math.min(14, 80 / size));
        pt = setView(c.c[0], c.c[1], k);
        label.textContent = '';
        wrap.classList.remove('fallback');
      } else {
        // No outline: show the continent and a marker on the world map.
        active = null;
        var g = GROUP_CENTRES[group] || [data.w / 2, data.h / 2];
        pt = setView(g[0], g[1], 1);
        label.textContent = groupLabel || '';
        wrap.classList.add('fallback');
      }
      pinG.style.transform = 'translate(' + pt[0] + 'px,' + pt[1] + 'px)';
      pinG.setAttribute('opacity', '1');
    }

    function clear() {
      if (!data) { pending = null; return; }
      if (active) active.classList.remove('on');
      active = null;
      setView(data.w / 2, data.h / 2, 1);
      pinG.setAttribute('opacity', '0');
      label.textContent = '';
    }

    load().then(build, function () {
      wrap.classList.add('failed');
      label.textContent = 'Map unavailable';
    });

    return { el: wrap, show: show, clear: clear };
  }

  CA.map = { load: load, create: create };
})(window);
