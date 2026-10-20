/*
 * Sync between devices, without accounts. One device creates a random
 * sync code; every device with that code merges its progress with a copy
 * kept by api/sync.js, country by country (the most recent answer wins).
 *
 * It syncs when the app opens or comes back to the front, a few seconds
 * after answering, and when the app is put away. Failures are quiet: the
 * next sync carries everything, since nothing is sent as a diff.
 *
 * The code is the only key, so it's long and random (12 characters from a
 * 31-symbol alphabet, about 59 bits).
 */
(function (root) {
  var CA = root.CA = root.CA || {};
  var ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';  // no i, l, o, 0, 1
  var ENDPOINT = 'api/sync';
  var AFTER_ANSWER_MS = 4000, STALE_MS = 15000;

  var deckId = null, timer = null, pending = false, inflight = null, again = false;
  var status = { state: 'idle', at: 0 };
  var listeners = [];

  function code() { return CA.store.getSettings().syncCode || null; }

  function generate() {
    var out = '', bytes = new Uint8Array(32);
    while (out.length < 12) {
      root.crypto.getRandomValues(bytes);
      for (var i = 0; i < bytes.length && out.length < 12; i++) {
        // 248 = 31 * 8, so every symbol is equally likely.
        if (bytes[i] < 248) out += ALPHABET[bytes[i] % 31];
      }
    }
    return out;
  }

  // Accepts a code typed any way ("ABCD-efgh jkmn") or a whole sync link.
  function parse(text) {
    text = String(text || '');
    var m = text.match(/#sync=([a-z0-9-]+)/i);
    if (m) text = m[1];
    var c = text.toLowerCase().replace(/[^a-z0-9]/g, '');
    return /^[a-z2-9]{12}$/.test(c) ? c : null;
  }

  function format(c) { return c ? c.slice(0, 4) + '-' + c.slice(4, 8) + '-' + c.slice(8) : ''; }

  function link(c) {
    return location.origin + location.pathname + '#sync=' + format(c || code());
  }

  function setStatus(state) {
    status = { state: state, at: state === 'ok' ? Date.now() : status.at };
    listeners.forEach(function (fn) { fn(status); });
  }

  // Send this device's progress; take back the merged copy.
  function now(opts) {
    var c = code();
    if (!c || !deckId) return Promise.resolve(false);
    clearTimeout(timer); pending = false;
    if (inflight) { again = true; return inflight; }
    setStatus('syncing');
    inflight = fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: c, deck: deckId, data: CA.store.deckData(deckId) }),
      keepalive: !!(opts && opts.leaving),
      cache: 'no-store'
    }).then(function (res) {
      if (!res.ok) throw new Error('sync ' + res.status);
      return res.json();
    }).then(function (body) {
      // Merge rather than replace: answers given while this was in
      // flight are kept.
      if (code() === c) CA.store.mergeDeckData(deckId, body.data);
      setStatus('ok');
      return true;
    }).catch(function () {
      setStatus('error');
      return false;
    }).then(function (ok) {
      inflight = null;
      if (again) { again = false; schedule(500); }
      return ok;
    });
    return inflight;
  }

  function schedule(ms) {
    if (!code()) return;
    clearTimeout(timer);
    pending = true;
    timer = setTimeout(now, ms);
  }

  function start(c) {
    CA.store.setSetting('syncCode', c);
    return now();
  }

  function stop() {
    clearTimeout(timer);
    CA.store.setSetting('syncCode', null);
    setStatus('idle');
  }

  function init(id) {
    deckId = id;
    CA.store.onProgress(function (d) { if (d === deckId) schedule(AFTER_ANSWER_MS); });
    document.addEventListener('visibilitychange', function () {
      if (!code()) return;
      if (document.visibilityState === 'hidden') { if (pending) now({ leaving: true }); }
      else if (Date.now() - status.at > STALE_MS) now();
    });
    root.addEventListener('online', function () { if (code()) now(); });
    if (code()) now();
  }

  CA.sync = {
    init: init,
    now: now,
    start: start,
    stop: stop,
    generate: generate,
    parse: parse,
    format: format,
    link: link,
    code: code,
    get status() { return status; },
    onStatus: function (fn) { listeners.push(fn); }
  };
})(window);
