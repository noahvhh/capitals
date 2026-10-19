/* Voice output via the Web Speech API. */
(function (root) {
  var CA = root.CA = root.CA || {};
  var synth = root.speechSynthesis;
  var voice = null;

  function pickVoice(lang) {
    if (!synth) return null;
    var voices = synth.getVoices();
    var base = lang.split('-')[0];
    return voices.find(function (v) { return v.lang === lang && v.localService; }) ||
      voices.find(function (v) { return v.lang === lang; }) ||
      voices.find(function (v) { return v.lang.replace('_', '-') === lang; }) ||
      voices.find(function (v) { return v.lang.indexOf(base) === 0; }) || null;
  }

  CA.speech = {
    supported: !!(synth && root.SpeechSynthesisUtterance),
    // Speaks text; calls onend when finished (or immediately if unsupported).
    speak: function (text, opts, onend) {
      opts = opts || {};
      if (!this.supported) { if (onend) setTimeout(onend, 0); return; }
      synth.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = opts.lang || 'en-GB';
      u.rate = opts.rate || 1;
      if (!voice || voice.lang !== u.lang) voice = pickVoice(u.lang);
      if (voice) u.voice = voice;
      var done = false;
      function finish() { if (!done) { done = true; if (onend) onend(); } }
      u.onend = finish;
      u.onerror = finish;
      synth.speak(u);
      // Some engines never fire onend; fall back to a rough duration.
      setTimeout(finish, 1200 + text.length * 110 / u.rate);
    },
    cancel: function () { if (this.supported) synth.cancel(); }
  };

  if (synth && synth.addEventListener) {
    synth.addEventListener('voiceschanged', function () { voice = null; });
  }
})(window);
