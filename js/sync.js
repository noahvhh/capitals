/*
 * Sync between devices. Devices that share a sync code merge their
 * progress with a copy kept by api/sync.js, country by country (the most
 * recent answer wins). The code comes from signing in to an account
 * (api/account.js), or one device creates it and the others type it in.
 *
 * When it syncs:
 *   - as soon as a quiz ends (flush), and 20 s after the last answer if
 *     a quiz is left open;
 *   - when the app is hidden (phone locked, app switched, tab closed),
 *     with sendBeacon, which the browser delivers even as it suspends
 *     the page; a plain fetch there is often dropped on phones;
 *   - when the app opens, and when it comes back to the front or the
 *     window is focused again, if the last sync is over 15 s old.
 * Writes are kept to about one per quiz because the free Blob plan
 * allows 2,000 a month. Failures are quiet: every sync sends all of this
 * device's progress, so the next one catches up.
 *
 * The code is the only key, so it's long and random (12 characters from a
 * 31-symbol alphabet, about 59 bits).
 */
(function (root) {
  var CA = root.CA = root.CA || {};
  var ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';  // no i, l, o, 0, 1
  var ENDPOINT = 'api/sync';
  var AFTER_ANSWER_MS = 20000, STALE_MS = 15000;

  var deckId = null, timer = null, pending = false, inflight = null, again = false;
  var dirty = false;      // answers given here that haven't been sent yet
  var failures = 0;       // in a row, for retrying with growing gaps
  var lastTry = 0;
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

  function payload(c) {
    return JSON.stringify({ code: c, deck: deckId, data: CA.store.deckData(deckId) });
  }

  // Send this device's progress; take back the merged copy.
  function now() {
    var c = code();
    if (!c || !deckId) return Promise.resolve(false);
    clearTimeout(timer); pending = false;
    if (inflight) { again = true; return inflight; }
    var sentDirty = dirty;
    dirty = false;
    lastTry = Date.now();
    setStatus('syncing');
    inflight = fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload(c),
      cache: 'no-store'
    }).then(function (res) {
      if (!res.ok) throw new Error('sync ' + res.status);
      return res.json();
    }).then(function (body) {
      // Merge rather than replace: answers given while this was in
      // flight are kept.
      if (code() === c) CA.store.mergeDeckData(deckId, body.data);
      failures = 0;
      setStatus('ok');
      return true;
    }).catch(function () {
      dirty = dirty || sentDirty;
      setStatus('error');
      // Retry by itself after 30 s, then 1, 2, 4… minutes, at most 10.
      failures++;
      schedule(Math.min(30000 * Math.pow(2, failures - 1), 600000));
      return false;
    }).then(function (ok) {
      inflight = null;
      if (again) { again = false; schedule(500); }
      return ok;
    });
    return inflight;
  }

  // While the page is being hidden: hand the progress to the browser to
  // deliver. The reply can't be read, so the merged copy comes back on
  // the next sync.
  function beacon() {
    var c = code();
    if (!c || !deckId) return;
    clearTimeout(timer); pending = false; dirty = false;
    var body = payload(c), sent = false;
    try {
      // text/plain keeps it a simple request; the function parses the text.
      sent = !!navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'text/plain;charset=UTF-8' }));
    } catch (e) { /* fall back below */ }
    if (!sent) fetch(ENDPOINT, { method: 'POST', body: body, keepalive: true }).catch(function () {});
  }

  // Send now if there are answers not sent yet (a quiz just ended).
  function flush() {
    return dirty || pending ? now() : Promise.resolve(true);
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
    CA.store.setSetting('account', null);
    setStatus('idle');
  }

  /*
   * Accounts (api/account.js): a username and password stand for a sync
   * code. Signing up keeps the code this device already syncs with, if
   * any. Rejects with Error(code): bad-username, bad-password, taken,
   * wrong, or offline.
   */
  function account(action, username, password) {
    return fetch('api/account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: action, username: username, password: password, key: action === 'signup' ? code() : null }),
      cache: 'no-store'
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (!res.ok || !body.key) throw new Error(body.error || 'offline');
        return body;
      });
    }, function () {
      throw new Error('offline');
    }).then(function (body) {
      CA.store.setSetting('account', { username: body.username });
      start(body.key);
      return body;
    });
  }

  function user() {
    var a = CA.store.getSettings().account;
    return a && code() ? a.username : null;
  }

  function init(id) {
    deckId = id;
    CA.store.onProgress(function (d) {
      if (d !== deckId) return;
      dirty = true;
      schedule(AFTER_ANSWER_MS);
    });
    function leaving() { if (code() && dirty) beacon(); }
    function back() { if (code() && Date.now() - lastTry > STALE_MS) now(); }
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') leaving(); else back();
    });
    root.addEventListener('pagehide', leaving);
    // Coming back to a window that stayed visible (another window was in
    // front) doesn't change visibility, so listen for focus too.
    root.addEventListener('focus', back);
    root.addEventListener('online', function () { if (code()) now(); });
    if (code()) now();
  }

  CA.sync = {
    init: init,
    now: now,
    flush: flush,
    start: start,
    stop: stop,
    account: account,
    user: user,
    generate: generate,
    parse: parse,
    format: format,
    link: link,
    code: code,
    get status() { return status; },
    onStatus: function (fn) { listeners.push(fn); }
  };
})(window);
