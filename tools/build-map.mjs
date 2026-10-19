// Regenerates data/map.js from Natural Earth outlines (via the world-atlas
// npm package). Only needed if you want to change the map; the generated file
// is committed, so the site itself has no build step.
//
//   npm i world-atlas@2.0.2 topojson-client@3 d3-geo@3 i18n-iso-countries
//   node tools/build-map.mjs
//
// Output: equirectangular projection, 1000 units wide, cropped to 84°N–58°S
// (no Antarctica). Each country gets an SVG path, a pin point (centroid of
// its largest polygon) and the bounding box of that polygon for zooming.

import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { feature, merge } from 'topojson-client';
import { geoEquirectangular, geoPath, geoArea, geoStream } from 'd3-geo';

const require = createRequire(import.meta.url);
const iso = require('i18n-iso-countries');
const here = dirname(fileURLToPath(import.meta.url));

global.window = {};
require(join(here, '../data/countries.js'));
const rows = window.CA_DATA.countries;

const W = 1000, NORTH = 84, SOUTH = -58;
const H = Math.round(W * (NORTH - SOUTH) / 360 * 10) / 10;
// Translate so that latitude NORTH maps to y = 0.
const projection = geoEquirectangular()
  .scale(W / (2 * Math.PI))
  .translate([W / 2, (NORTH / 180) * (W / 2)]);

const t50 = require('world-atlas/countries-50m.json');
const t10 = require('world-atlas/countries-10m.json');

// Merge separatist / disputed areas into the UN-recognised state for
// highlighting: Somaliland -> Somalia, N. Cyprus -> Cyprus.
const MERGE = { '706': ['Somaliland'], '196': ['N. Cyprus'] };
// Features dropped entirely.
const DROP = new Set(['Antarctica', 'Fr. S. Antarctic Lands', 'Heard I. and McDonald Is.', 'S. Geo. and the Is.']);

function geomsById(topo) {
  const out = new Map();
  for (const g of topo.objects.countries.geometries) {
    const key = g.id || g.properties.name;
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(g);
  }
  return out;
}
const g50 = geomsById(t50);
const g10 = geomsById(t10);

function featureFor(topo, geoms) {
  if (geoms.length === 1) return feature(topo, geoms[0]);
  return { type: 'Feature', properties: {}, geometry: merge(topo, geoms) };
}

const round = (n, p) => Math.round(n * p) / p;

// Project a geometry through d3 (which cuts polygons at the antimeridian)
// and collect the resulting rings in map units.
function projectedRings(geometry) {
  const rings = [];
  let ring = null;
  const sink = {
    point(x, y) { ring.push([x, y]); },
    lineStart() { ring = []; },
    lineEnd() { if (ring.length) rings.push(ring); ring = null; },
    polygonStart() {}, polygonEnd() {}, sphere() {}
  };
  geoStream(geometry, projection.stream(sink));
  return rings;
}

// Serialise a geometry as a compact SVG path, dropping points closer than
// `tol` units to the previous kept point.
function toPath(geometry, tol, prec) {
  let d = '';
  for (const pts of projectedRings(geometry)) {
    const kept = [];
    for (const p of pts) {
      const last = kept[kept.length - 1];
      if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) >= tol) kept.push(p);
    }
    if (kept.length < 3) {
      if (pts.length >= 3) kept.splice(0, kept.length, pts[0], pts[Math.floor(pts.length / 3)], pts[Math.floor(2 * pts.length / 3)]);
      else continue;
    }
    let px = 0, py = 0;
    kept.forEach((p, i) => {
      const x = round(p[0], prec), y = round(p[1], prec);
      if (i === 0) d += 'M' + x + ' ' + y;
      else {
        const dx = round(x - px, prec), dy = round(y - py, prec);
        if (dx === 0 && dy === 0) return;
        d += 'l' + dx + ' ' + dy;
      }
      px = x; py = y;
    });
    d += 'z';
  }
  return d.replace(/ -/g, '-');
}

function largestPolygon(geometry) {
  if (geometry.type === 'Polygon') return geometry;
  let best = null, bestA = -1;
  for (const c of geometry.coordinates) {
    const poly = { type: 'Polygon', coordinates: c };
    const a = geoArea(poly);
    if (a > bestA) { bestA = a; best = poly; }
  }
  return best;
}

// Pin and zoom target for countries whose capital is not on their largest
// polygon: [lon, lat] of the capital; the nearest polygon is used instead.
const PIN_NEAR = { KI: [173.0, 1.4] };

function nearestPolygon(geometry, lonlat) {
  if (geometry.type === 'Polygon') return geometry;
  const [tx, ty] = projection(lonlat);
  let best = null, bestD = Infinity;
  for (const c of geometry.coordinates) {
    const poly = { type: 'Polygon', coordinates: c };
    const [x, y] = geoPath(projection).centroid(poly);
    const dd = Math.hypot(x - tx, y - ty);
    if (dd < bestD) { bestD = dd; best = poly; }
  }
  return best;
}

const path = geoPath(projection);
const countries = {};
const missing = [];
const used = new Set();

for (const [code] of rows) {
  const num = iso.alpha2ToNumeric(code);
  let topo = t50, geoms = g50.get(num);
  if (!geoms) { topo = t10; geoms = g10.get(num); }
  if (!geoms) { missing.push(code); continue; }
  used.add(num);
  const extra = (MERGE[num] || []).flatMap((name) => g50.get(name) || []);
  extra.forEach((g) => used.add(g.properties.name));
  const f = featureFor(topo, geoms.concat(topo === t50 ? extra : []));
  const main = PIN_NEAR[code] ? nearestPolygon(f.geometry, PIN_NEAR[code]) : largestPolygon(f.geometry);
  const [[x0, y0], [x1, y1]] = path.bounds(main);
  const size = Math.max(x1 - x0, y1 - y0);
  // Small countries get zoomed in, so they keep more detail.
  const tol = size < 4 ? 0.01 : size < 20 ? 0.05 : 0.6;
  const prec = size < 20 ? 100 : 10;
  const c = path.centroid(main);
  countries[code] = {
    d: toPath(f.geometry, tol, prec),
    c: [round(c[0], 100), round(c[1], 100)],
    b: [round(x0, 100), round(y0, 100), round(x1, 100), round(y1, 100)]
  };
}

// Everything else (territories, Kosovo, W. Sahara, ...) is drawn as plain
// land with no highlight.
let other = '';
for (const g of t50.objects.countries.geometries) {
  const key = g.id || g.properties.name;
  if (used.has(key) || used.has(g.properties.name) || DROP.has(g.properties.name)) continue;
  other += toPath(feature(t50, g).geometry, 0.6, 10);
}

const out = { w: W, h: H, other, countries };
const js = '/* Generated by tools/build-map.mjs from Natural Earth (public domain) via world-atlas. */\n' +
  '(function (r) { r.CA_DATA = r.CA_DATA || {}; r.CA_DATA.map = ' + JSON.stringify(out) + '; })(window);\n';
writeFileSync(join(here, '../data/map.js'), js);
console.log('wrote data/map.js', (js.length / 1024).toFixed(1) + ' KB', 'missing:', missing.join(',') || 'none');
