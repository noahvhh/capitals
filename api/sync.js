/*
 * Progress sync between devices. There are no accounts: a device creates
 * a random 12-character sync code, and every device using that code
 * shares one copy of the progress in a private Vercel Blob store.
 *
 *   GET  /api/sync?code=…&deck=capitals         -> { data }
 *   POST /api/sync  { code, deck, data }         -> { data } (merged)
 *
 * data is { items: { <id>: { r, w, s, t } }, resetAt }. Merging keeps,
 * for each item, the copy answered most recently (largest t), and drops
 * anything older than the latest reset.
 */
import { get, put, BlobPreconditionFailedError } from '@vercel/blob';

const CODE = /^[a-z2-9]{12}$/;
const DECK = /^[a-z0-9-]{1,32}$/;
const ITEM = /^[A-Za-z0-9_-]{1,16}$/;
const MAX_BODY = 200000;
const MAX_ITEMS = 2000;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

function num(v) {
  return typeof v === 'number' && isFinite(v) && v >= 0 ? v : 0;
}

// Keep only well-formed items, so the stored copy can't be filled with junk.
function clean(data) {
  const out = { items: {}, resetAt: num(data && data.resetAt) };
  const items = (data && typeof data.items === 'object' && data.items) || {};
  Object.keys(items).slice(0, MAX_ITEMS).forEach((id) => {
    const it = items[id];
    if (!ITEM.test(id) || !it || typeof it !== 'object') return;
    out.items[id] = { r: num(it.r), w: num(it.w), s: num(it.s), t: num(it.t) };
  });
  return out;
}

function merge(a, b) {
  const resetAt = Math.max(a.resetAt || 0, b.resetAt || 0);
  const items = {};
  [a.items, b.items].forEach((src) => {
    Object.keys(src).forEach((id) => {
      const it = src[id], cur = items[id];
      if (!(it.t > resetAt)) return;
      if (!cur || it.t > cur.t || (it.t === cur.t && it.r + it.w > cur.r + cur.w)) items[id] = it;
    });
  });
  return { items, resetAt };
}

function pathFor(code, deck) {
  return `sync/${code}/${deck}.json`;
}

async function read(path) {
  // useCache: false so a write from the other device is seen straight away.
  const res = await get(path, { access: 'private', useCache: false });
  if (!res || res.statusCode !== 200) return { data: { items: {}, resetAt: 0 }, etag: null };
  const text = await new Response(res.stream).text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch (e) { /* treat as empty */ }
  // Once a file is big enough to be served compressed, get() reports a
  // weak ETag (W/"…"), but put({ ifMatch }) only accepts the strong form
  // ("…") and otherwise fails every time. Same hash, so drop the prefix.
  const etag = res.blob.etag ? String(res.blob.etag).replace(/^W\//, '') : null;
  return { data: clean(parsed), etag };
}

function save(path, data, etag) {
  return put(path, JSON.stringify(data), {
    access: 'private',
    allowOverwrite: true,
    contentType: 'application/json',
    cacheControlMaxAge: 60,
    ...(etag ? { ifMatch: etag } : {})
  });
}

function params(code, deck) {
  code = String(code || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  deck = String(deck || 'capitals');
  return CODE.test(code) && DECK.test(deck) ? { code, deck } : null;
}

export async function GET(request) {
  const url = new URL(request.url);
  const p = params(url.searchParams.get('code'), url.searchParams.get('deck'));
  if (!p) return json({ error: 'bad code' }, 400);
  const { data } = await read(pathFor(p.code, p.deck));
  return json({ data });
}

export async function POST(request) {
  const text = await request.text();
  if (text.length > MAX_BODY) return json({ error: 'too large' }, 413);
  let body;
  try { body = JSON.parse(text); } catch (e) { return json({ error: 'bad json' }, 400); }
  const p = params(body && body.code, body && body.deck);
  if (!p) return json({ error: 'bad code' }, 400);
  const incoming = clean(body.data);
  const path = pathFor(p.code, p.deck);

  // Read, merge and write back only if nothing changed in between; if the
  // other device wrote first, read again and merge with that.
  let merged = incoming;
  for (let attempt = 0; attempt < 3; attempt++) {
    const stored = await read(path);
    merged = merge(stored.data, incoming);
    if (JSON.stringify(merged) === JSON.stringify(stored.data)) return json({ data: merged });
    try {
      await save(path, merged, stored.etag);
      return json({ data: merged });
    } catch (err) {
      if (!(err instanceof BlobPreconditionFailedError)) throw err;
    }
  }
  // Still clashing after three tries: save the latest merge anyway rather
  // than refuse. At worst a device's answers from the last few seconds
  // are left for its next sync, which sends everything again.
  await save(path, merged, null);
  return json({ data: merged });
}
