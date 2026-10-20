/*
 * UI: screens, events and the question flow. Talks to the deck only through
 * its generic description (directions, media, groups) and to persistence
 * only through CA.store.
 */
(function (root) {
  var CA = root.CA;
  var t = CA.i18n.t;
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };

  var deck = CA.decks[CA.config.deck];
  var store = CA.store;
  store.init();
  var settings = store.getSettings();

  var current = 'home';
  var session = null, sessionInfo = null, revealed = false;
  var mode = 'type';                 // this session: type | choices | self
  var tries = 0, hints = 0;          // typing: wrong attempts and hints on this question
  var actionState = null;
  var timers = [], autoplayPaused = false, wakeLock = null;

  /* ---------- language ---------- */

  function setLanguage(lang, save) {
    CA.i18n.set(lang);
    lang = CA.i18n.lang;
    if (deck.setLanguage) deck.setLanguage(lang);
    CA.i18n.apply();
    $('.lang-btn').setAttribute('lang', lang === 'es' ? 'en' : 'es');
    if (save) store.setSetting('language', lang);
    renderHome();
    if (current === 'settings') renderSettings();
    if (current === 'mixed') renderMixed();
    updateAutoplayButton();
  }

  function speechLang() { return CA.i18n.lang === 'es' ? 'es-ES' : (settings.lang || 'en-GB'); }
  function say(text, onend) { CA.speech.speak(text, { lang: speechLang(), rate: settings.rate }, onend); }

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
    }, 200);
    to.hidden = false;
    to.classList.add('screen-entering');
    requestAnimationFrame(function () { requestAnimationFrame(function () { to.classList.remove('screen-entering'); }); });
    root.scrollTo(0, 0);
    if (name === 'home') renderHome();
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
      if (o.lang) b.setAttribute('lang', o.lang);
      b.addEventListener('click', function () {
        $$('.seg', el).forEach(function (s) { s.setAttribute('aria-checked', 'false'); });
        b.setAttribute('aria-checked', 'true');
        onPick(o.id);
      });
      el.appendChild(b);
    });
  }

  function directionOptions() {
    var opts = deck.directions.map(function (d) { return { id: d.id, label: t('dir.' + d.id) }; });
    if (opts.length > 1) opts.push({ id: 'mixed', label: t('dir.mixed') });
    return opts;
  }

  var DIFFICULTIES = ['easy', 'hard', 'all'];

  function countFor(filter) { return CA.quiz.pool(deck, filter).length; }
  function dueItems() { return CA.quiz.due(deck, function (id) { return store.getItem(deck.id, id); }); }

  function renderHome() {
    var sum = store.deckSummary(deck.id);
    var total = sum.right + sum.wrong;
    $('#home-stats').textContent = total
      ? t('home.stats', { seen: sum.seen, total: deck.items.length, pct: Math.round(100 * sum.right / total) })
      : t('home.toLearn', { n: deck.items.length });

    var due = dueItems().length;
    $('#btn-review').disabled = !due;
    $('#review-count').textContent = due || '';
    $('#review-hint').textContent = t(due ? 'review.some' : 'review.none');

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
      DIFFICULTIES.forEach(function (d) {
        if (!deck.hardKey && d !== 'all') return;
        var n = countFor({ groups: [g.id], difficulty: d });
        var label = t('diff.' + d);
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn-sm';
        b.disabled = !n;
        b.innerHTML = '<span></span><span class="count"></span>';
        b.firstChild.textContent = label;
        b.lastChild.textContent = n;
        b.setAttribute('aria-label', t('continent.aria', { group: g.label, diff: label, n: n }));
        b.addEventListener('click', function () {
          startSession({
            title: g.label + ' · ' + label,
            items: CA.quiz.pool(deck, { groups: [g.id], difficulty: d })
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
    $('#mixed-diff').closest('.field').hidden = !deck.hardKey;
    segmented($('#mixed-diff'), DIFFICULTIES.map(function (d) { return { id: d, label: t('diff.' + d) }; }),
      settings.mixedDifficulty, function (v) {
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
    btn.textContent = n ? t('mixed.start', { n: n }) : t('mixed.pick');
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
      direction: settings.direction,
      record: function (id, ok) { store.record(deck.id, id, ok); }
    });
    autoplayPaused = false;
    // Hands-free reveals by itself, so it always uses self-check.
    mode = handsFree() ? 'self' : settings.answer;
    actionState = null;
    buildStage();
    show('quiz');
    document.documentElement.classList.toggle('mode-type', mode === 'type');
    // Speaking inside the tap handler unlocks speech on iOS.
    if (settings.voice) say(' ');
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

    if (mode === 'choices') buildChoices(q, dir);
    if (mode === 'type') resetTyping(dir);
    setActions(mode === 'self' ? 'reveal' : mode);
    if (mode === 'type') input.focus({ preventScroll: true });
    var promptText = speakText(dir.speakPrompt, dir.prompt, q.item);
    announce(promptText);
    if (settings.voice) {
      say(promptText, function () {
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

  // state: reveal | grade | choices | type
  function setActions(state) {
    var els = { reveal: $('#btn-reveal'), grade: $('#grade-row'), choices: $('#choices'), type: $('#type-form') };
    Object.keys(els).forEach(function (k) { els[k].hidden = k !== state; });
    var el = els[state];
    // Fade in when the controls change, not on every question while typing.
    if (state !== actionState || state !== 'type') {
      el.classList.remove('fade-in');
      void el.offsetWidth;
      el.classList.add('fade-in');
    }
    actionState = state;
    if (state === 'grade') $('[data-action="got-it"]').focus({ preventScroll: true });
  }

  function currentAnswer() { return $('.q-block:not(.leaving) .q-answer', stage); }

  function reveal(auto) {
    if (!session || !session.current || revealed) return;
    revealed = true;
    clearTimers();
    var q = session.current, dir = direction(q);
    var ans = currentAnswer();
    if (ans) {
      if (ans.classList.contains('hinting')) {
        $('.qt-main', ans).textContent = String(q.item[dir.answer.field]);
        ans.classList.remove('hinting');
      }
      ans.classList.add('shown');
      ans.removeAttribute('aria-hidden');
    }
    mediaSlots.forEach(function (s) { s.update(q.item, true); });
    if (mode === 'self') setActions('grade');
    var answerText = speakText(dir.speakAnswer, dir.answer, q.item);
    announce(answerText);
    if (settings.voice) {
      say(answerText, function () {
        if (auto && handsFree() && !autoplayPaused && session && session.current === q) {
          later(function () {
            if (session && session.current === q && q.graded === null) { session.skip(); next(); }
          }, 1800);
        }
      });
    }
  }

  // Moves on by itself after a right answer; longer when there's a note
  // or the answer is read aloud.
  function moveOnSoon(q, dir, ms) {
    var note = dir.answer.note && q.item[dir.answer.note];
    later(advance, ms + (note ? 1500 : 0) + (settings.voice ? 800 : 0));
  }

  function grade(ok) {
    if (!session || !revealed) return;
    clearTimers();
    CA.speech.cancel();
    session.grade(ok);
    next();
  }

  function advance() {
    if (!session || !revealed) return;
    clearTimers();
    CA.speech.cancel();
    next();
  }

  /* ---------- multiple choice ---------- */

  function buildChoices(q, dir) {
    var box = $('#choices');
    box.innerHTML = '';
    box.classList.remove('answered');
    CA.quiz.choices(deck, q.item, dir.answer.field, 4).forEach(function (v, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn choice' + (v.length > 22 ? ' long' : '');
      b.setAttribute('data-action', 'choose');
      b.setAttribute('data-value', v);
      b.innerHTML = '<kbd class="kbd" aria-hidden="true"></kbd><span class="choice-text"></span>';
      $('.kbd', b).textContent = i + 1;
      $('.choice-text', b).textContent = v;
      box.appendChild(b);
    });
  }

  // Mark the pick, show the answer, then move on by itself, sooner when
  // right. Tapping again moves on straight away.
  function choose(el) {
    if (!session || !session.current) return;
    if (revealed) return advance();
    var q = session.current, dir = direction(q);
    var answer = String(q.item[dir.answer.field]);
    var right = el.getAttribute('data-value') === answer;
    var box = $('#choices');
    box.classList.add('answered');
    $$('.choice', box).forEach(function (b) {
      if (b.getAttribute('data-value') === answer) b.classList.add('is-right');
      else if (b === el) b.classList.add('is-wrong');
    });
    session.grade(right);
    reveal(false);
    announce(t(right ? 'say.right' : 'say.wrong') + ' ' + speakText(dir.speakAnswer, dir.answer, q.item));
    moveOnSoon(q, dir, right ? 900 : 2400);
  }

  /* ---------- typing ---------- */

  var input = $('#type-input');

  function resetTyping(dir) {
    tries = 0; hints = 0;
    input.value = '';
    input.placeholder = t('type.' + dir.answer.field);
    input.classList.remove('is-right', 'is-wrong', 'shake');
    setStatus('', '');
    $('#type-help').hidden = false;
    $('#btn-next').hidden = true;
    $('#btn-hint').disabled = false;
  }

  function setStatus(text, kind) {
    var el = $('#type-status');
    el.textContent = text;
    el.className = 'type-status' + (kind ? ' is-' + kind : '');
  }

  function shake() {
    input.classList.remove('shake');
    void input.offsetWidth;
    input.classList.add('shake');
  }

  // Each hint shows one more letter of the answer, with blanks for the rest.
  function hint() {
    if (!session || !session.current || revealed || mode !== 'type') return;
    var q = session.current, dir = direction(q);
    var answer = String(q.item[dir.answer.field]);
    var letters = answer.replace(/[^\p{L}\p{N}]/gu, '').length;
    if (hints >= letters - 1) return;
    hints++;
    var n = 0;
    var mask = Array.from(answer).map(function (ch) {
      return /[\p{L}\p{N}]/u.test(ch) ? (n++ < hints ? ch : '_') : ch;
    }).join('');
    var ans = currentAnswer();
    if (ans) {
      ans.classList.add('hinting');
      $('.qt-main', ans).textContent = mask;
    }
    $('#btn-hint').disabled = hints >= letters - 1;
    input.focus({ preventScroll: true });
  }

  /*
   * Typed answers. Right first time with at most one hint counts as right.
   * A second try or more hints still shows "right", but it's recorded as
   * a miss so it comes back in Review mistakes. Two wrong tries reveal it.
   */
  function submitTyping() {
    if (!session || !session.current) return;
    if (revealed) return advance();
    var q = session.current, dir = direction(q), field = dir.answer.field;
    var res = CA.quiz.check(deck, q.item, field, input.value);
    if (res.empty) { shake(); return; }
    if (!res.ok) {
      tries++;
      if (tries < 2) {
        setStatus(t('type.tryAgain'), 'wrong');
        shake();
        input.select();
        return;
      }
      input.classList.add('is-wrong');
      return endTyping(false, false, t('type.wrong'));
    }
    input.classList.add('is-right');
    var clean = tries === 0 && hints <= 1;
    var msg = !clean ? t(hints > 1 ? 'type.rightHints' : 'type.rightSecond')
      : res.exact ? t('type.right') : t('type.spelled', { answer: String(q.item[field]) });
    endTyping(clean, true, msg, res.exact ? 1100 : 2200);
  }

  function dontKnow() {
    if (!session || !session.current || revealed || mode !== 'type') return;
    endTyping(false, false, t('type.dunnoMsg'));
  }

  // ok: recorded as right. right: the typed answer was correct.
  function endTyping(ok, right, msg, waitMs) {
    var q = session.current, dir = direction(q);
    session.grade(ok);
    reveal(false);
    setStatus(msg, right ? 'right' : 'wrong');
    $('#type-help').hidden = true;
    $('#btn-next').hidden = false;
    announce(t(right ? 'say.right' : 'say.wrong') + ' ' + speakText(dir.speakAnswer, dir.answer, q.item));
    if (ok) moveOnSoon(q, dir, waitMs);
    input.focus({ preventScroll: true });
  }

  $('#type-form').addEventListener('submit', function (e) {
    e.preventDefault();
    submitTyping();
  });

  /* ---------- end of session ---------- */

  function finish() {
    clearTimers();
    releaseWakeLock();
    input.blur();
    var graded = session.history.filter(function (h) { return h.graded !== null; });
    var right = graded.filter(function (h) { return h.graded; }).length;
    var missed = [];
    graded.forEach(function (h) {
      if (!h.graded && missed.indexOf(h.item) === -1) missed.push(h.item);
    });
    $('#done-mode').textContent = sessionInfo.title;
    $('#done-title').textContent = graded.length ? right + ' / ' + graded.length : t('done.title');
    $('#done-sub').textContent = !graded.length ? t('done.none')
      : missed.length ? t('done.missed', { n: missed.length })
      : t('done.allRight');
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
      startSession({ title: t('session.missedFrom', { title: sessionInfo.title }), items: missed });
    };
    session = null;
    show('done');
  }

  function quit() {
    clearTimers();
    CA.speech.cancel();
    releaseWakeLock();
    input.blur();
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
    b.setAttribute('aria-label', t(autoplayPaused ? 'quiz.resume' : 'quiz.pause'));
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
    $$('[data-setting]').forEach(function (el) {
      var k = el.getAttribute('data-setting');
      if (el.type === 'checkbox') el.checked = !!settings[k];
      else el.value = settings[k];
    });
    segmented($('#language-picker'), [{ id: 'en', label: 'English', lang: 'en' }, { id: 'es', label: 'Español', lang: 'es' }],
      CA.i18n.lang, function (v) { setLanguage(v, true); });
    segmented($('#answer-picker'), ['type', 'choices', 'self'].map(function (m) { return { id: m, label: t('answer.' + m) }; }),
      settings.answer, function (v) { store.setSetting('answer', v); });
    segmented($('#length-picker'), CA.config.reviewLengths.map(function (n) { return { id: n, label: String(n) }; }),
      settings.reviewLength, function (v) { store.setSetting('reviewLength', v); });
    if (!CA.speech.supported) {
      $('[data-setting="voice"]').disabled = true;
      $('#voice-desc').textContent = t('settings.noSpeech');
    }
    var hasReverse = deck.directions.some(function (d) { return d.mediaOnReveal; });
    $('[data-setting="mediaBeforeReveal"]').closest('.toggle-row').hidden = !hasReverse;
    reflectSettings();
    var sum = store.deckSummary(deck.id);
    $('#progress-summary').textContent = sum.right + sum.wrong
      ? t('progress.summary', { seen: sum.seen, total: deck.items.length, right: sum.right, wrong: sum.wrong })
      : t('progress.none');
  }

  function reflectSettings() {
    var html = document.documentElement;
    html.classList.toggle('voice-on', !!settings.voice);
    html.classList.toggle('autoplay-on', !!(settings.voice && settings.autoplay));
    $('#rate-out').textContent = Number(settings.rate).toLocaleString(CA.i18n.lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '×';
    $('#think-out').textContent = settings.thinkSeconds + ' s';
  }

  $$('[data-setting]').forEach(function (el) {
    el.addEventListener(el.type === 'range' ? 'input' : 'change', function () {
      var k = el.getAttribute('data-setting');
      var v = el.type === 'checkbox' ? el.checked : Number(el.value);
      store.setSetting(k, v);
      reflectSettings();
    });
  });

  function message(text) {
    $('#settings-msg').textContent = text;
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
    message(t('msg.saved'));
  }

  $('#import-file').addEventListener('change', function (e) {
    var file = e.target.files[0];
    if (!file) return;
    file.text().then(function (txt) {
      store.importJSON(txt);
      settings = store.getSettings();
      setLanguage(settings.language || CA.i18n.lang, false);
      renderSettings();
      message(t('msg.imported'));
    }).catch(function (err) {
      message(t('msg.importFailed', { error: err.message }));
    });
    e.target.value = '';
  });

  function confirmReset() {
    var dlg = $('#confirm');
    function doReset() {
      store.reset();
      renderSettings();
      message(t('msg.reset'));
    }
    if (typeof dlg.showModal !== 'function') {
      if (root.confirm(t('reset.confirm'))) doReset();
      return;
    }
    dlg.returnValue = '';
    dlg.showModal();
    dlg.addEventListener('close', function onClose() {
      dlg.removeEventListener('close', onClose);
      if (dlg.returnValue === 'ok') doReset();
    });
  }

  /* ---------- on-screen keyboard ---------- */

  // While typing on a phone, size the quiz to the part of the screen the
  // keyboard leaves, so the map, the question and the box all stay in view.
  var vv = root.visualViewport, tallest = 0;
  function fitViewport() {
    if (!vv || vv.scale > 1.05) return;
    var html = document.documentElement;
    tallest = Math.max(tallest, vv.height);
    var typing = document.activeElement === input;
    var kb = typing && vv.height < tallest * 0.8;
    html.style.setProperty('--app-h', Math.round(vv.height) + 'px');
    html.classList.toggle('kb-open', kb);
    if (kb && current === 'quiz') root.scrollTo(0, 0);
  }
  if (vv) {
    vv.addEventListener('resize', fitViewport);
    root.addEventListener('orientationchange', function () { tallest = 0; });
    input.addEventListener('focus', function () { setTimeout(fitViewport, 300); });
    input.addEventListener('blur', function () { setTimeout(fitViewport, 300); });
    fitViewport();
  }

  /* ---------- events ---------- */

  var actions = {
    'home': function () { show('home'); },
    'toggle-lang': function () { setLanguage(CA.i18n.lang === 'es' ? 'en' : 'es', true); },
    'start-review': function () {
      startSession({ title: t('session.review'), items: dueItems().slice(0, settings.reviewLength) });
    },
    'start-random': function () {
      startSession({ title: t('session.random'), items: deck.items });
    },
    'open-mixed': function () { renderMixed(); show('mixed'); },
    'start-mixed': function () {
      startSession({ title: t('session.mixed'), items: mixedPool() });
    },
    'open-settings': function () { renderSettings(); message(''); show('settings'); },
    'reveal': function () { reveal(false); },
    'choose': function (el) { choose(el); },
    'hint': hint,
    'dunno': dontKnow,
    'next': advance,
    'got-it': function () { grade(true); },
    'missed': function () { grade(false); },
    'quit': quit,
    'speak-again': function () {
      if (!session || !session.current) return;
      var q = session.current, dir = direction(q);
      var text = speakText(dir.speakPrompt, dir.prompt, q.item);
      if (revealed) text += '. ' + speakText(dir.speakAnswer, dir.answer, q.item);
      say(text);
    },
    'toggle-autoplay': toggleAutoplay,
    'test-voice': function () { say(t('settings.testPhrase')); },
    'export': exportProgress,
    'import': function () { $('#import-file').click(); },
    'reset': confirmReset
  };

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    var fn = actions[el.getAttribute('data-action')];
    if (fn) { e.preventDefault(); fn(el); }
  });

  document.addEventListener('keydown', function (e) {
    if (current !== 'quiz' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape') { quit(); return; }
    if (mode === 'type') {
      // Enter in the box submits the form; elsewhere it moves on.
      if (revealed && e.key === 'Enter' && e.target !== input) { e.preventDefault(); advance(); }
      return;
    }
    if (mode === 'choices') {
      var pick = $$('#choices .choice')[Number(e.key) - 1];
      if (!revealed && pick) { e.preventDefault(); choose(pick); }
      else if (revealed && (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight')) { e.preventDefault(); advance(); }
      return;
    }
    if (!revealed && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); reveal(false); return; }
    if (revealed && (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === 'j')) { e.preventDefault(); grade(true); }
    if (revealed && (e.key === 'ArrowLeft' || e.key === 'Backspace' || e.key === 'f')) { e.preventDefault(); grade(false); }
  });

  store.onChange(function (s) { settings = s.settings; });

  /* ---------- boot ---------- */

  document.body.setAttribute('data-screen', 'home');
  reflectSettings();
  setLanguage(settings.language || CA.i18n.preferred(), false);

  // Fetch the map outlines once the home screen is up, so the first
  // question doesn't wait for them.
  var idle = root.requestIdleCallback || function (fn) { return setTimeout(fn, 600); };
  root.addEventListener('load', function () { idle(function () { CA.map.load().catch(function () {}); }); });

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    root.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
})(window);
