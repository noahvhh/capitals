/*
 * Locator map: equirectangular world drawn on a canvas, cropped above
 * Antarctica. Outlines come from data/map.js (generated from Natural Earth
 * by tools/build-map.mjs), loaded with a plain script tag so it also works
 * when the site is opened straight from a folder.
 *
 * Moving between countries flies the camera: it zooms out, pans and zooms
 * back in along the path from van Wijk and Nuij, "Smooth and efficient
 * zooming and panning" (2003), the same one d3.interpolateZoom uses.
 */
(function (root) {
  var CA = root.CA = root.CA || {};

  // Rough centres (map units) used when a country has no outline.
  var GROUP_CENTRES = {
    EU: [542, 89], AF: [556, 219], AS: [750, 136], AM: [278, 206], OC: [917, 275]
  };

  // A country's main landmass fills about a quarter of the frame, but the
  // frame never gets narrower than MIN_W map units (1000 = 360°), so tiny
  // islands keep some surroundings.
  var FIT = 4, MIN_W = 60;
  var MIN_MS = 550, MAX_MS = 1300;

  var reduceMotion = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)');

  var loading = null;
  function load() {
    if (root.CA_DATA && root.CA_DATA.map) return Promise.resolve(prepare(root.CA_DATA.map));
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = CA.config.mapData;
      s.async = true;
      s.onload = function () { resolve(prepare(root.CA_DATA.map)); };
      s.onerror = function () { loading = null; reject(new Error('Map data failed to load')); };
      document.head.appendChild(s);
    });
    return loading;
  }

  // Outlines at three levels of detail, in map units: full, then points
  // closer than 0.35 and 1.2 units dropped. Zoomed out, the full outlines
  // are mostly sub-pixel wiggles that cost frames during a flight.
  var LOD_TOL = [0, 0.35, 1.2];
  function lodFor(s) { return s >= 3.5 ? 0 : s >= 1 ? 1 : 2; }

  // The paths are "M x y" then relative "l dx dy" steps, one "z" per ring
  // (see toPath in tools/build-map.mjs).
  function rings(d) {
    var out = [];
    d.split('z').forEach(function (r) {
      var n = r.match(/-?(?:\d+\.?\d*|\.\d+)/g);
      if (!n || n.length < 6) return;
      var x = +n[0], y = +n[1], pts = [x, y];
      for (var i = 2; i + 1 < n.length; i += 2) { x += +n[i]; y += +n[i + 1]; pts.push(x, y); }
      out.push(pts);
    });
    return out;
  }

  function simplify(rs, tol) {
    var p = new Path2D(), t2 = tol * tol;
    rs.forEach(function (pts) {
      var lx = pts[0], ly = pts[1], kept = [lx, ly];
      for (var i = 2; i < pts.length; i += 2) {
        var dx = pts[i] - lx, dy = pts[i + 1] - ly;
        if (dx * dx + dy * dy >= t2) kept.push(lx = pts[i], ly = pts[i + 1]);
      }
      // Rings smaller than the tolerance are invisible at this zoom.
      if (kept.length < 6) return;
      p.moveTo(kept[0], kept[1]);
      for (i = 2; i < kept.length; i += 2) p.lineTo(kept[i], kept[i + 1]);
      p.closePath();
    });
    return p;
  }

  function levels(d) {
    var rs = rings(d);
    return LOD_TOL.map(function (tol) { return tol ? simplify(rs, tol) : new Path2D(d); });
  }

  // Parse the outlines once, shared by every map on the page.
  function prepare(d) {
    if (d.shapes) return d;
    d.otherLod = levels(d.other);
    d.shapes = Object.keys(d.countries).map(function (id) {
      var c = d.countries[id];
      c.lod = levels(c.d);
      c.path = c.lod[0];
      return c;
    });
    return d;
  }

  /* ---------- smooth zoom ---------- */

  var RHO = Math.SQRT2;
  function cosh(x) { return ((x = Math.exp(x)) + 1 / x) / 2; }
  function sinh(x) { return ((x = Math.exp(x)) - 1 / x) / 2; }
  function tanh(x) { return ((x = Math.exp(2 * x)) - 1) / (x + 1); }

  // Views are [centre x, centre y, visible width], all in map units.
  function flight(a, b) {
    var x0 = a[0], y0 = a[1], w0 = a[2], x1 = b[0], y1 = b[1], w1 = b[2];
    var dx = x1 - x0, dy = y1 - y0, d2 = dx * dx + dy * dy, S, at;
    if (d2 < 1e-6) {
      S = Math.log(w1 / w0) / RHO;
      at = function (t) { return [x0 + t * dx, y0 + t * dy, w0 * Math.exp(RHO * t * S)]; };
    } else {
      var d1 = Math.sqrt(d2);
      var b0 = (w1 * w1 - w0 * w0 + 4 * d2) / (4 * w0 * d1);
      var b1 = (w1 * w1 - w0 * w0 - 4 * d2) / (4 * w1 * d1);
      var r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0);
      var r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
      S = (r1 - r0) / RHO;
      at = function (t) {
        var s = t * S, ch = cosh(r0);
        var u = w0 / (2 * d1) * (ch * tanh(RHO * s + r0) - sinh(r0));
        return [x0 + u * dx, y0 + u * dy, w0 * ch / cosh(RHO * s + r0)];
      };
    }
    return { at: at, ms: Math.max(MIN_MS, Math.min(MAX_MS, Math.abs(S) * 480)) };
  }

  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

  /* ---------- a map instance ---------- */

  function create(container) {
    var wrap = document.createElement('div');
    wrap.className = 'map';
    wrap.innerHTML =
      '<canvas class="map-canvas" role="img"></canvas>' +
      '<div class="map-pin" aria-hidden="true"><span class="pin-ring"></span><span class="pin-dot"></span></div>' +
      '<div class="map-label" aria-hidden="true"></div>';
    container.appendChild(wrap);
    var canvas = wrap.querySelector('canvas');
    canvas.setAttribute('aria-label', CA.i18n.t('map.label'));
    var ctx = canvas.getContext('2d');
    var pin = wrap.querySelector('.map-pin');
    var label = wrap.querySelector('.map-label');

    var data = null, colors = null;
    var size = { w: 0, h: 0, dpr: 1 };
    var view = null;          // camera now: [x, y, width]
    var shown = null;         // { id, view, pin, label } being shown
    var fading = null;        // the previous one, fading out
    var inA = 1, outA = 0;    // highlight opacity of `shown` and `fading`
    var pending = null;       // show() arguments waiting for data or size
    var frame = 0, flying = false;

    function readColors() {
      var cs = getComputedStyle(wrap);
      function v(name, fallback) { return cs.getPropertyValue(name).trim() || fallback; }
      colors = {
        land: v('--map-land', '#1f1f22'),
        border: v('--map-border', '#050505'),
        active: v('--map-active', '#6a8dd8')
      };
    }

    function worldView() { return [data.w / 2, data.h / 2, data.w]; }

    function fit(c) {
      var aspect = size.w / size.h;
      var bw = c.b[2] - c.b[0], bh = c.b[3] - c.b[1];
      var w = Math.max(bw * FIT, bh * FIT * aspect, MIN_W);
      return [c.c[0], c.c[1], Math.min(w, data.w)];
    }

    // Keep the camera from showing empty space above or below the map
    // when zoomed in.
    function clampY(v) {
      var vh = v[2] * size.h / size.w;
      if (vh >= data.h) return data.h / 2;
      return Math.min(data.h - vh / 2, Math.max(vh / 2, v[1]));
    }

    function draw() {
      if (!data || !size.w || !view) return;
      var W = data.w, dpr = size.dpr, shapes = data.shapes;
      var x = view[0], w = view[2], s = size.w / w, y = clampY(view);
      var h = size.h / s, top = y - h / 2, bottom = y + h / 2, lod = lodFor(s);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.lineJoin = 'round';

      // The world repeats sideways so flights across the date line (Fiji,
      // Samoa, Tuvalu...) stay continuous.
      for (var copy = Math.floor((x - w / 2) / W); copy * W < x + w / 2; copy++) {
        var off = copy * W, left = x - w / 2 - off, right = x + w / 2 - off;
        var visible = [];
        for (var i = 0; i < shapes.length; i++) {
          var b = shapes[i].b;
          // The box is the main landmass only, so leave a wide margin for
          // outlying islands.
          if (s < 3 || !(b[2] < left - 60 || b[0] > right + 60 || b[3] < top - 60 || b[1] > bottom + 60)) visible.push(shapes[i]);
        }
        ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (size.w / 2 - (x - off) * s), dpr * (size.h / 2 - y * s));
        ctx.lineWidth = 0.9 / s;
        ctx.fillStyle = colors.land;
        ctx.fill(data.otherLod[lod]);
        for (i = 0; i < visible.length; i++) ctx.fill(visible[i].lod[lod]);
        ctx.strokeStyle = colors.border;
        for (i = 0; i < visible.length; i++) ctx.stroke(visible[i].lod[lod]);
        highlight(fading, outA);
        highlight(shown, inA);
      }
      placePin(s, x, y);
    }

    function highlight(t, alpha) {
      if (!t || !t.id || alpha <= 0) return;
      var path = data.countries[t.id].path;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = colors.active;
      ctx.strokeStyle = colors.active;
      ctx.fill(path);
      ctx.stroke(path);
      ctx.globalAlpha = 1;
    }

    function placePin(s, x, y) {
      if (!shown || !shown.pin) { pin.style.opacity = '0'; return; }
      var px = shown.pin[0];
      // Use the copy of the world nearest the camera.
      px += Math.round((x - px) / data.w) * data.w;
      var sx = size.w / 2 + (px - x) * s, sy = size.h / 2 + (shown.pin[1] - y) * s;
      pin.style.transform = 'translate3d(' + sx.toFixed(1) + 'px,' + sy.toFixed(1) + 'px,0)';
      // The pin is for countries too small to see; big ones just light up.
      var b = shown.id && data.countries[shown.id].b;
      var big = b && Math.max(b[2] - b[0], b[3] - b[1]) * s > 30;
      pin.style.opacity = big ? '0' : String(clamp01((inA - 0.5) * 2));
    }

    function go(t) {
      var to = t.view.slice();
      if (!view) view = worldView();
      // Fly the short way round: aim at the copy of the target nearest
      // the current camera.
      to[0] += Math.round((view[0] - to[0]) / data.w) * data.w;

      cancelAnimationFrame(frame);
      fading = shown && shown.id && inA > 0.5 ? shown : null;
      shown = t;
      label.textContent = '';
      wrap.classList.toggle('fallback', !!t.label);

      if (reduceMotion && reduceMotion.matches) { view = to; return land(); }
      var f = flight(view, to), start = 0;
      flying = true;
      function step(now) {
        if (!start) start = now;
        var p = clamp01((now - start) / f.ms);
        view = f.at(easeInOut(p));
        // The old highlight fades over the first third and the new one
        // over the second half, so the eye lands on it as the camera
        // settles.
        outA = 1 - clamp01(p * 3);
        inA = clamp01((p - 0.45) / 0.55);
        draw();
        if (p < 1) frame = requestAnimationFrame(step);
        else { view = to; land(); }
      }
      outA = fading ? 1 : 0;
      inA = 0;
      frame = requestAnimationFrame(step);
    }

    function land() {
      flying = false;
      view[0] = ((view[0] % data.w) + data.w) % data.w;
      fading = null; outA = 0; inA = 1;
      draw();
      label.textContent = shown.label || '';
    }

    function resize() {
      var r = wrap.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      size.w = r.width; size.h = r.height;
      size.dpr = Math.min(root.devicePixelRatio || 1, 2);
      canvas.width = Math.round(size.w * size.dpr);
      canvas.height = Math.round(size.h * size.dpr);
      if (data && shown) {
        // Refit to the new frame shape; a flight in progress keeps going.
        if (shown.id) shown.view = fit(data.countries[shown.id]);
        if (!flying) view = shown.view.slice();
      }
      draw();
      return true;
    }

    function ready() {
      if (!data || !size.w) return;
      if (pending) { var p = pending; pending = null; show.apply(null, p); }
      else if (!view) { view = worldView(); draw(); }
    }

    function show(id, group, groupLabel) {
      if (!data || !size.w) { pending = [id, group, groupLabel]; return; }
      var c = data.countries[id];
      if (c) {
        if (shown && shown.id === id) return;
        return go({ id: id, view: fit(c), pin: c.c, label: '' });
      }
      // No outline: show the continent with a marker on the world map.
      var g = GROUP_CENTRES[group] || [data.w / 2, data.h / 2];
      go({ id: null, view: worldView(), pin: g, label: groupLabel || '' });
    }

    function clear() {
      if (!data || !size.w) { pending = null; return; }
      if (shown && !shown.id && !shown.pin) return;
      go({ id: null, view: worldView(), pin: null, label: '' });
    }

    if ('ResizeObserver' in root) {
      var ro = new ResizeObserver(function () {
        if (!wrap.isConnected) { ro.disconnect(); cancelAnimationFrame(frame); return; }
        var first = !size.w;
        if (resize() && first) ready();
      });
      ro.observe(wrap);
    } else {
      root.addEventListener('resize', resize);
      setTimeout(function () { if (resize()) ready(); }, 0);
    }

    load().then(function (d) {
      data = d;
      readColors();
      wrap.classList.add('ready');
      if (!size.w) resize();
      ready();
    }, function () {
      wrap.classList.add('failed');
      label.textContent = CA.i18n.t('map.unavailable');
    });

    return { el: wrap, show: show, clear: clear };
  }

  CA.map = { load: load, create: create };
})(window);
