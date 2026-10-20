/*
 * Interface text in English and Spanish. Static text in index.html is
 * marked with data-i18n (textContent), data-i18n-aria (aria-label) or
 * data-i18n-placeholder; scripts call CA.i18n.t(key, vars), where vars
 * fill {name} placeholders. Country and capital names live with the deck.
 */
(function (root) {
  var CA = root.CA = root.CA || {};

  var STRINGS = {
    en: {
      'app.title': 'Capitals',
      'lang.switch': 'Español',
      'home.toLearn': '{n} to learn',
      'home.stats': '{seen} of {total} seen · {pct}% right',
      'home.askFor': 'Ask for the',
      'dir.forward': 'Capital',
      'dir.reverse': 'Country',
      'dir.mixed': 'Both',
      'review.button': 'Review mistakes',
      'review.some': 'Missed ones stay here until you get them right a couple of times.',
      'review.none': 'Nothing to review yet. Anything you miss shows up here.',
      'home.byContinent': 'By continent',
      'diff.easy': 'Easy',
      'diff.hard': 'Hard',
      'diff.all': 'All',
      'continent.aria': '{group}, {diff}, {n} questions',
      'home.mixed': 'Mixed',
      'home.random': 'Random',
      'home.settings': 'Settings and progress',
      'mixed.hint': 'Tick any combination.',
      'mixed.difficulty': 'Difficulty',
      'mixed.start': 'Start · {n}',
      'mixed.pick': 'Pick at least one',
      'nav.back': 'Back',
      'quiz.end': 'End session',
      'quiz.speak': 'Read aloud again',
      'quiz.pause': 'Pause hands-free',
      'quiz.resume': 'Resume hands-free',
      'quiz.progress': 'Session progress',
      'quiz.reveal': 'Reveal',
      'quiz.missed': 'Missed',
      'quiz.gotIt': 'Got it',
      'quiz.answers': 'Answers',
      'key.space': 'Space',
      'key.enter': 'Enter',
      'type.capital': 'Type the capital',
      'type.country': 'Type the country',
      'type.check': 'Check',
      'type.hint': 'Hint',
      'type.dunno': "Don't know",
      'type.next': 'Next',
      'type.right': 'Right!',
      'type.spelled': 'Right! It’s spelled {answer}.',
      'type.tryAgain': 'Not quite. Try again, or take a hint.',
      'type.rightHints': 'Right, with hints, so it’ll come back in your review.',
      'type.rightSecond': 'Right on the second try, so it’ll come back in your review.',
      'type.wrong': 'Not this time. Have a look, then go on.',
      'type.dunnoMsg': 'Have a look, then go on. It’ll come back in your review.',
      'say.right': 'Right.',
      'say.wrong': 'Not quite.',
      'done.title': 'Done',
      'done.none': 'Nothing was scored this time.',
      'done.missed': 'Missed {n} this time.',
      'done.allRight': 'Every one right.',
      'done.retry': 'Go over the missed ones',
      'done.home': 'Home',
      'session.review': 'Review',
      'session.random': 'Random',
      'session.mixed': 'Mixed',
      'session.missedFrom': 'Missed from {title}',
      'settings.title': 'Settings',
      'settings.language': 'Language',
      'settings.quiz': 'Quiz',
      'settings.answerBy': 'Answer by',
      'answer.type': 'Typing',
      'answer.choices': '4 choices',
      'answer.self': 'Self-check',
      'settings.media': 'Show flag and map before answering',
      'settings.mediaDesc': 'When asking capital → country, the flag and map give the answer away, so they are hidden until you answer.',
      'settings.reviewLength': 'Review length',
      'settings.voice': 'Voice',
      'settings.readAloud': 'Read aloud',
      'settings.readAloudDesc': 'Reads each prompt, and the answer when revealed.',
      'settings.noSpeech': 'This browser has no speech support.',
      'settings.speed': 'Speed',
      'settings.handsFree': 'Hands-free',
      'settings.handsFreeDesc': 'Reveals and moves on by itself, keeping the screen awake. Uses self-check, and answers aren’t scored unless you tap.',
      'settings.thinking': 'Thinking time',
      'settings.testVoice': 'Test voice',
      'settings.testPhrase': 'Bern is the capital of Switzerland.',
      'settings.progress': 'Progress',
      'settings.export': 'Export',
      'settings.import': 'Import',
      'settings.reset': 'Reset progress',
      'progress.summary': '{seen} of {total} seen. {right} right, {wrong} missed in total.',
      'progress.none': 'No answers recorded yet.',
      'msg.saved': 'Backup saved.',
      'msg.imported': 'Progress imported.',
      'msg.importFailed': 'Could not import: {error}',
      'msg.reset': 'Progress reset.',
      'reset.title': 'Reset progress?',
      'reset.desc': 'This clears every right and wrong answer on this device. Export a backup first if you might want it back.',
      'reset.confirm': 'Reset all progress on this device?',
      'reset.cancel': 'Cancel',
      'reset.ok': 'Reset',
      'also': 'also {name}',
      'flag': 'Flag',
      'flag.of': 'Flag of {name}',
      'map.label': 'World map',
      'map.unavailable': 'Map unavailable'
    },
    es: {
      'app.title': 'Capitales',
      'lang.switch': 'English',
      'home.toLearn': '{n} por aprender',
      'home.stats': '{seen} de {total} vistos · {pct} % de aciertos',
      'home.askFor': 'Preguntar por',
      'dir.forward': 'Capital',
      'dir.reverse': 'País',
      'dir.mixed': 'Ambos',
      'review.button': 'Repasar fallos',
      'review.some': 'Los que falles se quedan aquí hasta que los aciertes un par de veces.',
      'review.none': 'Aún no hay nada que repasar. Lo que falles aparecerá aquí.',
      'home.byContinent': 'Por continente',
      'diff.easy': 'Fácil',
      'diff.hard': 'Difícil',
      'diff.all': 'Todos',
      'continent.aria': '{group}, {diff}, {n} preguntas',
      'home.mixed': 'Mezcla',
      'home.random': 'Aleatorio',
      'home.settings': 'Ajustes y progreso',
      'mixed.hint': 'Marca los que quieras.',
      'mixed.difficulty': 'Dificultad',
      'mixed.start': 'Empezar · {n}',
      'mixed.pick': 'Elige al menos uno',
      'nav.back': 'Atrás',
      'quiz.end': 'Terminar',
      'quiz.speak': 'Volver a leer',
      'quiz.pause': 'Pausar manos libres',
      'quiz.resume': 'Reanudar manos libres',
      'quiz.progress': 'Progreso',
      'quiz.reveal': 'Mostrar',
      'quiz.missed': 'Fallé',
      'quiz.gotIt': 'Acerté',
      'quiz.answers': 'Respuestas',
      'key.space': 'Espacio',
      'key.enter': 'Intro',
      'type.capital': 'Escribe la capital',
      'type.country': 'Escribe el país',
      'type.check': 'Comprobar',
      'type.hint': 'Pista',
      'type.dunno': 'No lo sé',
      'type.next': 'Siguiente',
      'type.right': '¡Correcto!',
      'type.spelled': '¡Correcto! Se escribe {answer}.',
      'type.tryAgain': 'No es eso. Prueba otra vez o pide una pista.',
      'type.rightHints': 'Correcto, con pistas, así que volverá en el repaso.',
      'type.rightSecond': 'Correcto al segundo intento, así que volverá en el repaso.',
      'type.wrong': 'Esta vez no. Fíjate bien y sigue.',
      'type.dunnoMsg': 'Fíjate bien y sigue. Volverá en el repaso.',
      'say.right': 'Correcto.',
      'say.wrong': 'No es eso.',
      'done.title': 'Hecho',
      'done.none': 'Esta vez no se ha puntuado nada.',
      'done.missed': 'Has fallado {n} esta vez.',
      'done.allRight': 'Todas bien.',
      'done.retry': 'Repasar las falladas',
      'done.home': 'Inicio',
      'session.review': 'Repaso',
      'session.random': 'Aleatorio',
      'session.mixed': 'Mezcla',
      'session.missedFrom': 'Falladas de {title}',
      'settings.title': 'Ajustes',
      'settings.language': 'Idioma',
      'settings.quiz': 'Preguntas',
      'settings.answerBy': 'Responder',
      'answer.type': 'Escribiendo',
      'answer.choices': '4 opciones',
      'answer.self': 'Autoevaluar',
      'settings.media': 'Mostrar bandera y mapa antes de responder',
      'settings.mediaDesc': 'Al preguntar capital → país, la bandera y el mapa delatan la respuesta, así que se ocultan hasta que respondes.',
      'settings.reviewLength': 'Preguntas por repaso',
      'settings.voice': 'Voz',
      'settings.readAloud': 'Leer en voz alta',
      'settings.readAloudDesc': 'Lee cada pregunta, y la respuesta al mostrarla.',
      'settings.noSpeech': 'Este navegador no puede leer en voz alta.',
      'settings.speed': 'Velocidad',
      'settings.handsFree': 'Manos libres',
      'settings.handsFreeDesc': 'Muestra la respuesta y avanza solo, sin que se apague la pantalla. Usa la autoevaluación y no puntúa a menos que toques.',
      'settings.thinking': 'Tiempo para pensar',
      'settings.testVoice': 'Probar voz',
      'settings.testPhrase': 'Berna es la capital de Suiza.',
      'settings.progress': 'Progreso',
      'settings.export': 'Exportar',
      'settings.import': 'Importar',
      'settings.reset': 'Borrar progreso',
      'progress.summary': '{seen} de {total} vistos. {right} aciertos y {wrong} fallos en total.',
      'progress.none': 'Todavía no hay respuestas.',
      'msg.saved': 'Copia guardada.',
      'msg.imported': 'Progreso importado.',
      'msg.importFailed': 'No se pudo importar: {error}',
      'msg.reset': 'Progreso borrado.',
      'reset.title': '¿Borrar el progreso?',
      'reset.desc': 'Se borran todos los aciertos y fallos de este dispositivo. Exporta una copia antes si quizá quieras recuperarlos.',
      'reset.confirm': '¿Borrar todo el progreso de este dispositivo?',
      'reset.cancel': 'Cancelar',
      'reset.ok': 'Borrar',
      'also': 'también {name}',
      'flag': 'Bandera',
      'flag.of': 'Bandera de {name}',
      'map.label': 'Mapa del mundo',
      'map.unavailable': 'Mapa no disponible'
    }
  };

  var lang = 'en';

  function t(key, vars) {
    var s = (STRINGS[lang] && STRINGS[lang][key]) || STRINGS.en[key] || key;
    if (vars) s = s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
    return s;
  }

  function apply() {
    document.documentElement.lang = lang;
    document.title = t('app.title');
    function each(attr, fn) {
      Array.prototype.forEach.call(document.querySelectorAll('[' + attr + ']'), function (el) { fn(el, t(el.getAttribute(attr))); });
    }
    each('data-i18n', function (el, s) { el.textContent = s; });
    each('data-i18n-aria', function (el, s) { el.setAttribute('aria-label', s); });
    each('data-i18n-placeholder', function (el, s) { el.setAttribute('placeholder', s); });
  }

  // The browser's language, if the app has it; English otherwise.
  function preferred() {
    var langs = navigator.languages || [navigator.language || 'en'];
    for (var i = 0; i < langs.length; i++) {
      var l = String(langs[i]).slice(0, 2).toLowerCase();
      if (STRINGS[l]) return l;
    }
    return 'en';
  }

  CA.i18n = {
    t: t,
    apply: apply,
    preferred: preferred,
    languages: Object.keys(STRINGS),
    get lang() { return lang; },
    set: function (l) { lang = STRINGS[l] ? l : 'en'; }
  };
})(window);
