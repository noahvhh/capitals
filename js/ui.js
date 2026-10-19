/*
 * UI: screens, events and the question flow. Talks to the deck only through
 * its generic description (directions, media, groups) and to persistence
 * only through CA.store.
 */
(function (root) {
  var CA = root.CA;
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };

  var deck = CA.decks[CA.config.deck];
  var store = CA.store;
  store.init();
  var settings = store.getSettings();

  var shader = CA.shader.init($('#swirl'));
  var current = 'home';
  var session = null, sessionInfo = null, revealed = false;
  var timers = [], autoplayPaused = false, wakeLock = null;

  /* ---------- screens ---------- */

  function show(name) {
    if (name === current) return;
    var from = $('.screen[data-screen="' + current + '"]');
    var to = $('.screen[data-screen="' + name + '"]');
    current = name;
    document.body.setAttribute('data-screen', name);
    from.classList.add('screen-leaving');
    setTimeout(function () {
      from.hidden = true;
      from.classList.remove('screen-leaving');
    }, 320);
    to.hidden = false;
    to.classList.add('screen-entering');
    requestAnimationFrame(function () { requestAnimationFrame(function () { to.classList.remove('screen-entering'); }); });
    root.scrollTo(0, 0);
    if (name === 'home') { shader.start(); renderHome(); } else shader.stop();
    var focusTarget = $('h1, h2, .icon-btn', to);
    if (focusTarget && name !== 'quiz') { focusTarget.setAttribute('tabindex', '-1'); focusTarget.focus({ preventScroll: true }); }
  }

  /* ---------- home ---------- */

  function segmented(el, options, value, onPick) {
    el.innerHTML = '';
    options.forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'seg';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(o.id === value));
      b.textContent = o.label;
      b.addEventListener('click', function () {
        $$('.seg', el).forEach(function (s) { s.setAttribute('aria-checked', 'false'); });
        b.setAttribute('aria-checked', 'true');
        onPick(o.id);
      });
      el.appendChild(b);
    });
  }

  function directionOptions() {
    var opts = deck.directions.map(function (d) { return { id: d.id, label: d.short || d.label }; });
    if (opts.length > 1) opts.push({ id: 'mixed', label: 'Both' });
    return opts;
  }

  function countFor(filter) { return CA.quiz.pool(deck, filter).length; }

  function renderHome() {
    $('#home-title').textContent = deck.title;
    $('#home-sub').textContent = deck.tagline || '';
    var sum = store.deckSummary(deck.id);
    var total = sum.right + sum.wrong;
    $('#home-stats').textContent = total
      ? sum.seen + ' of ' + deck.items.length + ' seen · ' + Math.round(100 * sum.right / total) + '% right'
      : deck.items.length + ' to learn';

    segmented($('#direction-picker'), directionOptions(), settings.direction, function (v) {
      store.setSetting('direction', v);
    });

    var list = $('#continent-list');
    list.innerHTML = '';
    (deck.groups || []).forEach(function (g) {
      var li = document.createElement('li');
      li.className = 'continent';
      var name = document.createElement('span');
      name.className = 'continent-name display';
      name.textContent = g.label;
      li.appendChild(name);
      var btns = document.createElement('span');
      btns.className = 'continent-btns';
      [['easy', 'Easy'], ['hard', 'Hard'], ['all', 'All']].forEach(function (d) {
        if (!deck.hardKey && d[0] !== 'all') return;
        var n = countFor({ groups: [g.id], difficulty: d[0] });
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn-sm';
        b.disabled = !n;
        b.innerHTML = '<span>' + d[1] + '</span><span class="count">' + n + '</span>';
        b.setAttribute('aria-label', g.label + ', ' + d[1] + ', ' + n + ' questions');
        b.addEventListener('click', function () {
          startSession({
            title: g.label + ' · ' + d[1],
            items: CA.quiz.pool(deck, { groups: [g.id], difficulty: d[0] }),
            mode: 'sequence'
          });
        });
        btns.appendChild(b);
      });
      li.appendChild(btns);
      list.appendChild(li);
    });
  }

  /* ---------- mixed ---------- */

  function renderMixed() {
    var list = $('#mixed-list');
    list.innerHTML = '';
    var chosen = settings.mixedGroups.slice();
    (deck.groups || []).forEach(function (g) {
      var li = document.createElement('li');
      li.innerHTML = '<label class="check-row"><input type="checkbox" class="check"><span class="display"></span><span class="count"></span></label>';
      var input = $('input', li);
      $('.display', li).textContent = g.label;
      $('.count', li).textContent = countFor({ groups: [g.id] });
      input.checked = chosen.indexOf(g.id) >= 0;
      input.addEventListener('change', function () {
        var set = settings.mixedGroups.filter(function (x) { return x !== g.id; });
        if (input.checked) set.push(g.id);
        store.setSetting('mixedGroups', set);
        updateMixedStart();
      });
      list.appendChild(li);
    });
    var diffs = [{ id: 'easy', label: 'Easy' }, { id: 'hard', label: 'Hard' }, { id: 'all', label: 'All' }];
    $('#mixed-diff').closest('.field').hidden = !deck.hardKey;
    segmented($('#mixed-diff'), diffs, settings.mixedDifficulty, function (v) {
      store.setSetting('mixedDifficulty', v);
      updateMixedStart();
    });
    updateMixedStart();
  }

  function mixedPool() {
    return CA.quiz.pool(deck, { groups: settings.mixedGroups, difficulty: settings.mixedDifficulty });
  }
  function updateMixedStart() {
    var n = settings.mixedGroups.length ? mixedPool().length : 0;
    var btn = $('#mixed-start');
    btn.disabled = !n;
    btn.textContent = n ? 'Start · ' + n : 'Pick at least one';
  }

  /* ---------- quiz ---------- */

  var mediaSlots = [];
  var stage = $('#question');

  function buildStage() {
    stage.innerHTML = '';
    var media = document.createElement('div');
    media.className = 'q-media';
    mediaSlots = (deck.media || []).map(function (spec) {
      var s = CA.render.mediaSlot(spec, deck);
      media.appendChild(s.el);
      return s;
    });
    if (mediaSlots.length) stage.appendChild(media);
    var textSlot = document.createElement('div');
    textSlot.className = 'q-text';
    stage.appendChild(textSlot);
  }

  function direction(q) {
    return deck.directions.find(function (d) { return d.id === q.direction; }) || deck.directions[0];
  }

  function startSession(info) {
    if (!info.items.length) return;
    sessionInfo = info;
    session = CA.quiz.createSession({
      deck: deck,
      items: info.items,
      mode: info.mode,
      length: settings.reviewLength,
      direction: settings.direction,
      stats: function (id) { return store.getItem(deck.id, id); },
      record: function (id, ok) { store.record(deck.id, id, ok); }
    });
    autoplayPaused = false;
    buildStage();
    show('quiz');
    // Speaking inside the tap handler unlocks speech on iOS.
    if (settings.voice) CA.speech.speak(' ', { lang: settings.lang, rate: settings.rate });
    if (handsFree()) requestWakeLock();
    updateAutoplayButton();
    next();
  }

  function handsFree() { return settings.voice && settings.autoplay && CA.speech.supported; }

  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }

  function next() {
    clearTimers();
    var q = session.next();
    if (!q) return finish();
    revealed = false;
    var dir = direction(q);
    var mediaVisible = !dir.mediaOnReveal || settings.mediaBeforeReveal;
    mediaSlots.forEach(function (s) { s.update(q.item, mediaVisible); });

    var block = document.createElement('div');
    block.className = 'q-block';
    block.appendChild(CA.render.element(dir.prompt, q.item, 'prompt', deck));
    var ans = document.createElement('div');
    ans.className = 'q-answer';
    ans.setAttribute('aria-hidden', 'true');
    ans.appendChild(CA.render.element(dir.answer, q.item, 'answer', deck));
    block.appendChild(ans);
    CA.render.swap($('.q-text', stage), block);

    $('#quiz-counter').textContent = (session.index + 1) + ' / ' + session.total;
    var bar = $('#quiz-progress');
    bar.setAttribute('aria-valuemax', session.total);
    bar.setAttribute('aria-valuenow', session.index);
    $('span', bar).style.transform = 'scaleX(' + (session.index / session.total) + ')';

    setActions(false);
    var promptText = speakText(dir.speakPrompt, dir.prompt, q.item);
    announce(promptText);
    if (settings.voice) {
      CA.speech.speak(promptText, { lang: settings.lang, rate: settings.rate }, function () {
        if (handsFree() && !autoplayPaused && session && session.current === q && !revealed) {
          later(function () { if (!revealed && session.current === q) reveal(true); }, settings.thinkSeconds * 1000);
        }
      });
    }
  }

  function speakText(fn, spec, item) {
    if (fn) return fn(item);
    return spec.type === 'text' ? String(item[spec.field]) : '';
  }

  function setActions(isRevealed) {
    var reveal = $('#btn-reveal'), grade = $('#grade-row');
    reveal.hidden = isRevealed;
    grade.hidden = !isRevealed;
    (isRevealed ? grade : reveal).classList.remove('fade-in');
    void (isRevealed ? grade : reveal).offsetWidth;
    (isRevealed ? grade : reveal).classList.add('fade-in');
    if (isRevealed) $('[data-action="got-it"]').focus({ preventScroll: true });
  }

  function reveal(auto) {
    if (!session || !session.current || revealed) return;
    revealed = true;
    clearTimers();
    var q = session.current, dir = direction(q);
    var ans = $('.q-block:not(.leaving) .q-answer', stage);
    if (ans) { ans.classList.add('shown'); ans.removeAttribute('aria-hidden'); }
    mediaSlots.forEach(function (s) { s.update(q.item, true); });
    setActions(true);
    var answerText = speakText(dir.speakAnswer, dir.answer, q.item);
    announce(answerText);
    if (settings.voice) {
      CA.speech.speak(answerText, { lang: settings.lang, rate: settings.rate }, function () {
        if (auto && handsFree() && !autoplayPaused && session && session.current === q) {
          later(function () {
            if (session && session.current === q && q.graded === null) { session.skip(); next(); }
          }, 1800);
        }
      });
    }
  }

  function grade(ok) {
    if (!session || !revealed) return;
    clearTimers();
    CA.speech.cancel();
    session.grade(ok);
    next();
  }

  function finish() {
    clearTimers();
    releaseWakeLock();
    var graded = session.history.filter(function (h) { return h.graded !== null; });
    var right = graded.filter(function (h) { return h.graded; }).length;
    var missed = [];
    graded.forEach(function (h) {
      if (!h.graded && missed.indexOf(h.item) === -1) missed.push(h.item);
    });
    $('#done-mode').textContent = sessionInfo.title;
    $('#done-title').textContent = graded.length ? right + ' / ' + graded.length : 'Done';
    $('#done-sub').textContent = !graded.length ? 'Nothing was scored this time.'
      : missed.length ? 'Missed ' + missed.length + (missed.length === 1 ? ' this time.' : ' this time.')
      : 'Every one right.';
    var ul = $('#done-missed');
    ul.innerHTML = '';
    var fwd = deck.directions[0];
    missed.forEach(function (it) {
      var li = document.createElement('li');
      var a = document.createElement('span');
      a.className = 'display';
      a.textContent = String(it[fwd.prompt.field] || '');
      var b = document.createElement('span');
      b.className = 'muted';
      b.textContent = String(it[fwd.answer.field] || '');
      li.appendChild(a); li.appendChild(b);
      ul.appendChild(li);
    });
    $('#btn-retry').hidden = !missed.length;
    $('#btn-retry').onclick = function () {
      startSession({ title: 'Missed from ' + sessionInfo.title, items: missed, mode: 'sequence' });
    };
    session = null;
    show('done');
  }

  function quit() {
    clearTimers();
    CA.speech.cancel();
    releaseWakeLock();
    if (session && session.history.some(function (h) { return h.graded !== null; })) return finish();
    session = null;
    show('home');
  }

  function announce(text) {
    if (settings.voice) return;
    var el = $('#sr-announce');
    el.textContent = '';
    setTimeout(function () { el.textContent = text; }, 50);
  }

  /* ---------- hands-free ---------- */

  function updateAutoplayButton() {
    var b = $('#autoplay-btn');
    $('use', b).setAttribute('href', autoplayPaused ? '#i-play' : '#i-pause');
    b.setAttribute('aria-label', autoplayPaused ? 'Resume hands-free' : 'Pause hands-free');
  }
  function toggleAutoplay() {
    autoplayPaused = !autoplayPaused;
    updateAutoplayButton();
    clearTimers();
    if (!autoplayPaused && session && session.current) {
      if (!revealed) reveal(true);
      else if (session.current.graded === null) { session.skip(); next(); }
    }
  }
  function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    navigator.wakeLock.request('screen').then(function (l) { wakeLock = l; }, function () {});
  }
  function releaseWakeLock() {
    if (wakeLock) { wakeLock.release().catch(function () {}); wakeLock = null; }
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && session && handsFree() && !wakeLock) requestWakeLock();
    if (document.visibilityState === 'visible') wakeLock = wakeLock && !wakeLock.released ? wakeLock : null;
  });

  /* ---------- settings ---------- */

  function renderSettings() {
    $$('[data-setting]').forEach(function (input) {
      var k = input.getAttribute('data-setting');
      if (input.type === 'checkbox') input.checked = !!settings[k];
      else input.value = settings[k];
    });
    segmented($('#length-picker'), CA.config.reviewLengths.map(function (n) { return { id: n, label: String(n) }; }),
      settings.reviewLength, function (v) { store.setSetting('reviewLength', v); });
    if (!CA.speech.supported) {
      $('[data-setting="voice"]').disabled = true;
      $('#voice-desc').textContent = 'This browser has no speech support.';
    }
    var hasReverse = deck.directions.some(function (d) { return d.mediaOnReveal; });
    $('[data-setting="mediaBeforeReveal"]').closest('.toggle-row').hidden = !hasReverse;
    reflectSettings();
    var sum = store.deckSummary(deck.id);
    $('#progress-summary').textContent = sum.right + sum.wrong
      ? sum.seen + ' of ' + deck.items.length + ' seen. ' + sum.right + ' right, ' + sum.wrong + ' missed in total.'
      : 'No answers recorded yet.';
  }

  function reflectSettings() {
    var html = document.documentElement;
    html.classList.toggle('voice-on', !!settings.voice);
    html.classList.toggle('autoplay-on', !!(settings.voice && settings.autoplay));
    $('#rate-out').textContent = Number(settings.rate).toFixed(1) + '×';
    $('#think-out').textContent = settings.thinkSeconds + ' s';
  }

  $$('[data-setting]').forEach(function (input) {
    input.addEventListener(input.type === 'range' ? 'input' : 'change', function () {
      var k = input.getAttribute('data-setting');
      var v = input.type === 'checkbox' ? input.checked : Number(input.value);
      store.setSetting(k, v);
      reflectSettings();
    });
  });

  function message(text) {
    var el = $('#settings-msg');
    el.textContent = text;
  }

  function exportProgress() {
    var blob = new Blob([store.exportJSON()], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'capitals-progress-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    message('Backup saved.');
  }

  $('#import-file').addEventListener('change', function (e) {
    var file = e.target.files[0];
    if (!file) return;
    file.text().then(function (txt) {
      store.importJSON(txt);
      settings = store.getSettings();
      renderSettings();
      message('Progress imported.');
    }).catch(function (err) {
      message('Could not import: ' + err.message);
    });
    e.target.value = '';
  });

  function confirmReset() {
    var dlg = $('#confirm');
    function doReset() {
      store.reset();
      renderSettings();
      message('Progress reset.');
    }
    if (typeof dlg.showModal !== 'function') {
      if (root.confirm('Reset all progress on this device?')) doReset();
      return;
    }
    dlg.returnValue = '';
    dlg.showModal();
    dlg.addEventListener('close', function onClose() {
      dlg.removeEventListener('close', onClose);
      if (dlg.returnValue === 'ok') doReset();
    });
  }

  /* ---------- events ---------- */

  var actions = {
    'home': function () { show('home'); },
    'start-review': function () {
      startSession({ title: 'Review', items: deck.items, mode: 'weighted' });
    },
    'start-random': function () {
      startSession({ title: 'Random', items: deck.items, mode: 'sequence' });
    },
    'open-mixed': function () { renderMixed(); show('mixed'); },
    'start-mixed': function () {
      startSession({ title: 'Mixed', items: mixedPool(), mode: 'sequence' });
    },
    'open-settings': function () { renderSettings(); message(''); show('settings'); },
    'reveal': function () { reveal(false); },
    'got-it': function () { grade(true); },
    'missed': function () { grade(false); },
    'quit': quit,
    'speak-again': function () {
      if (!session || !session.current) return;
      var q = session.current, dir = direction(q);
      var t = speakText(dir.speakPrompt, dir.prompt, q.item);
      if (revealed) t += '. ' + speakText(dir.speakAnswer, dir.answer, q.item);
      CA.speech.speak(t, { lang: settings.lang, rate: settings.rate });
    },
    'toggle-autoplay': toggleAutoplay,
    'test-voice': function () {
      CA.speech.speak('Bern is the capital of Switzerland.', { lang: settings.lang, rate: settings.rate });
    },
    'export': exportProgress,
    'import': function () { $('#import-file').click(); },
    'reset': confirmReset
  };

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    var fn = actions[el.getAttribute('data-action')];
    if (fn) { e.preventDefault(); fn(); }
  });

  document.addEventListener('keydown', function (e) {
    if (current !== 'quiz' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape') { quit(); return; }
    if (!revealed && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); reveal(false); return; }
    if (revealed && (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === 'j')) { e.preventDefault(); grade(true); }
    if (revealed && (e.key === 'ArrowLeft' || e.key === 'Backspace' || e.key === 'f')) { e.preventDefault(); grade(false); }
  });

  store.onChange(function (s) { settings = s.settings; });

  /* ---------- boot ---------- */

  document.body.setAttribute('data-screen', 'home');
  reflectSettings();
  renderHome();
  shader.start();

  // Fetch the map outlines once the home screen is up, so the first
  // question doesn't wait for them.
  var idle = root.requestIdleCallback || function (fn) { return setTimeout(fn, 600); };
  root.addEventListener('load', function () { idle(function () { CA.map.load().catch(function () {}); }); });

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    root.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
})(window);
