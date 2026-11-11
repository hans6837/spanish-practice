/*
 * Sound and Azure: playing the model voice, recording, and scoring.
 * (Moved unchanged from app.js, including all the iPad audio fixes.
 *  The only change: the accent setting picks es-ES or es-MX.)
 */
(function () {
  "use strict";
  var SDK = window.SpeechSDK;
  var store = null;
  var state = { audioCache: {} };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); };
  var VOICES = {
    "es-ES": [["es-ES-ElviraNeural", "Elvira (woman)"], ["es-ES-AlvaroNeural", "Álvaro (man)"], ["es-ES-XimenaNeural", "Ximena (woman)"]],
    "es-MX": [["es-MX-DaliaNeural", "Dalia (woman)"], ["es-MX-JorgeNeural", "Jorge (man)"], ["es-MX-RenataNeural", "Renata (woman)"]],
  };
  function accent() { var a = store && store.settings().accent; return VOICES[a] ? a : "es-ES"; }
  function voiceFor() {
    var v = store.settings().voice, list = VOICES[accent()];
    return list.some(function (x) { return x[0] === v; }) ? v : list[0][0];
  }

  // ------------------------------------------------------------ audio engine
  // iPads only allow sound that starts from a tap, so every button first
  // "unlocks" one shared AudioContext, and all sound goes through it.
  var AC = null, currentSource = null;
  // On iPads, web audio is silenced by Silent Mode (even at full volume).
  // Ask for the "play-and-record" audio session once, when the app opens
  // (Safari 16.4+): it plays in Silent Mode AND allows the microphone
  // ("playback" alone blocks recording). Changing it later, while sound is
  // starting, can pause the audio. Older iPads: play a short silent <audio>
  // clip inside the first tap.
  try { if (navigator.audioSession) navigator.audioSession.type = "play-and-record"; } catch (e) {}
  function silentWavUrl() {
    var n = 2205, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    function str(o, t) { for (var i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); }
    str(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); str(8, "WAVE"); str(12, "fmt ");
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 22050, true); v.setUint32(28, 44100, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, "data"); v.setUint32(40, n * 2, true);
    return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
  }
  var mediaUnlocked = !!navigator.audioSession;
  function unlockMediaPlayback() {
    if (mediaUnlocked) return;
    mediaUnlocked = true;
    try {
      var el = new Audio(silentWavUrl());
      el.setAttribute("playsinline", "");
      var p = el.play(); if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }
  function audio() {
    unlockMediaPlayback();
    mediaPlayer();
    if (!AC) {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      var b = AC.createBuffer(1, 1, 22050), s = AC.createBufferSource(); // silent unlock
      s.buffer = b; s.connect(AC.destination); s.start(0);
    }
    if (AC.state !== "running") { try { AC.resume(); } catch (e) {} }
    return AC;
  }
  // Speech and recordings play through one shared <audio> element (like a
  // video), not through web audio: on iPads web audio can go silent after the
  // microphone has been used, or in Silent Mode. The element is "unlocked"
  // with a silent clip inside the first tap, so later plays are allowed.
  var player = null, playerUnlocked = false, playerUrl = null, playerDone = null;
  function mediaPlayer() {
    if (!player) {
      player = document.createElement("audio");
      player.setAttribute("playsinline", ""); player.preload = "auto";
      document.body.appendChild(player);
    }
    if (!playerUnlocked) {
      playerUnlocked = true;
      try {
        player.src = silentWavUrl();
        var p = player.play();
        if (p && p.catch) p.catch(function () { playerUnlocked = false; });
      } catch (e) { playerUnlocked = false; }
    }
    return player;
  }
  function stopPlayback() {
    if (player) { try { player.pause(); } catch (e) {} }
    if (playerDone) { var d = playerDone; playerDone = null; d(); }
  }
  // data: ArrayBuffer of MP3 (Azure voice) or WAV (your recording)
  function playAudioData(data, mime) {
    var el = mediaPlayer();
    stopPlayback();
    if (playerUrl) { URL.revokeObjectURL(playerUrl); playerUrl = null; }
    playerUrl = URL.createObjectURL(new Blob([data], { type: mime }));
    return new Promise(function (resolve, reject) {
      var done = false;
      function finish() { if (done) return; done = true; el.onended = el.onerror = null; if (playerDone === finish) playerDone = null; resolve(); }
      playerDone = finish;
      el.onended = finish;
      el.onerror = function () { finish(); };
      el.src = playerUrl;
      el.volume = 1;
      var p = el.play();
      if (p && p.catch) p.catch(function (e) {
        done = true; playerDone = null;
        var err = new Error("The iPad blocked the sound. Tap the button again.");
        err.help = String(e && e.message || e); reject(err);
      });
      setTimeout(finish, 30000); // never wait forever
    });
  }
  function decode(arrayBuffer) {
    var ctx = audio();
    return new Promise(function (resolve, reject) { ctx.decodeAudioData(arrayBuffer.slice(0), resolve, function (e) { reject(e || new Error("Could not decode audio")); }); });
  }

  // ------------------------------------------------------------ Azure
  function speechConfig() {
    var s = store.settings();
    if (!store.isConfigured()) {
      var e = new Error("Azure is not set up yet."); e.help = "Open the Setup tab and paste your key and region."; throw e;
    }
    var cfg = SDK.SpeechConfig.fromSubscription(s.key, s.region);
    cfg.speechRecognitionLanguage = accent();
    return cfg;
  }
  function friendly(details) {
    var d = String(details || "");
    if (/401|403|auth|subscription|key/i.test(d)) return "Azure refused the key. Check KEY 1 and the region on the Setup tab. (" + d + ")";
    if (/quota|429|throttl/i.test(d)) return "The free Azure allowance is used up for now (free tier limit). Try again later. (" + d + ")";
    if (/1006|websocket|network|connect/i.test(d)) return "Could not connect to Azure. Check the Wi-Fi and that the region is correct. (" + d + ")";
    if (/internal (server )?error/i.test(d)) return "Azure had a temporary problem scoring this recording. (" + d + ")";
    return "Azure problem: " + d;
  }

  // Listen: Azure's voice for the chosen accent. The audio is kept in memory so replays are free.
  // opts.lang + opts.voice: speak in another language (e.g. an English prompt).
  function speak(text, slow, opts) {
    opts = opts || {};
    var ctx = audio();
    var s = store.settings(), rate = slow ? "-40%" : (opts.lang ? "0%" : (s.speed || "-15%"));
    var voice = opts.voice || voiceFor(), lang = opts.lang || accent();
    var cacheKey = voice + "|" + rate + "|" + text;
    if (state.audioCache[cacheKey]) return playAudioData(state.audioCache[cacheKey], "audio/mpeg");
    return new Promise(function (resolve, reject) {
      var cfg;
      try { cfg = speechConfig(); } catch (e) { return reject(e); }
      cfg.speechSynthesisOutputFormat = SDK.SpeechSynthesisOutputFormat.Audio24Khz48KBitRateMonoMp3;
      var synth = new SDK.SpeechSynthesizer(cfg, null);
      var ssml = '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="' + lang + '">' +
        '<voice name="' + esc(voice) + '"><prosody rate="' + esc(rate) + '">' + esc(text) + "</prosody></voice></speak>";
      synth.speakSsmlAsync(ssml, function (result) {
        synth.close();
        if (result.reason === SDK.ResultReason.SynthesizingAudioCompleted) resolve(result.audioData);
        else reject(new Error(friendly(result.errorDetails)));
      }, function (err) { synth.close(); reject(new Error(friendly(err))); });
    }).then(function (mp3) {
      state.audioCache[cacheKey] = mp3;
      return playAudioData(mp3, "audio/mpeg");
    });
  }
  function speakFallback(text, slow) {
    if (!window.speechSynthesis) return false;
    var u = new SpeechSynthesisUtterance(text);
    u.lang = accent(); u.rate = slow ? 0.6 : 0.85;
    var v = speechSynthesis.getVoices().filter(function (v) { return v.lang === accent(); })[0];
    if (v) u.voice = v;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
    return true;
  }

  // ------------------------------------------------------------ recording + assessment
  // One microphone stream feeds Azure (16 kHz) and keeps a copy for "Hear myself".
  function wavFromChunks(chunks, rate) {
    var len = chunks.reduce(function (n, c) { return n + c.length; }, 0);
    var buf = new ArrayBuffer(44 + len * 2), v = new DataView(buf), o = 0;
    function str(s) { for (var i = 0; i < s.length; i++) v.setUint8(o++, s.charCodeAt(i)); }
    str("RIFF"); v.setUint32(o, 36 + len * 2, true); o += 4; str("WAVEfmt ");
    v.setUint32(o, 16, true); o += 4; v.setUint16(o, 1, true); o += 2; v.setUint16(o, 1, true); o += 2;
    v.setUint32(o, rate, true); o += 4; v.setUint32(o, rate * 2, true); o += 4; v.setUint16(o, 2, true); o += 2; v.setUint16(o, 16, true); o += 2;
    str("data"); v.setUint32(o, len * 2, true); o += 4;
    chunks.forEach(function (c) { for (var i = 0; i < c.length; i++, o += 2) v.setInt16(o, c[i], true); });
    return buf;
  }

  // Scoring settings, from most detailed to simplest. The level that works
  // with this Azure resource is remembered on the iPad.
  var SCORING_LEVELS = [
    { granularity: "Phoneme", miscue: true },
    { granularity: "Phoneme", miscue: false },
    { granularity: "Word", miscue: false },
    { granularity: "FullText", miscue: false }
  ];
  function scoringLevel() {
    var n = parseInt(localStorage.getItem("scoringLevel") || "0", 10);
    return n >= 0 && n < SCORING_LEVELS.length ? n : 0;
  }
  function rememberScoringLevel(n) { try { localStorage.setItem("scoringLevel", String(n)); } catch (e) {} }
  function scoringConfig(referenceText, level) {
    var l = SCORING_LEVELS[level];
    return new SDK.PronunciationAssessmentConfig(referenceText,
      SDK.PronunciationAssessmentGradingSystem.HundredMark, SDK.PronunciationAssessmentGranularity[l.granularity], l.miscue);
  }

  /*
   * Record and score. Returns a controller {promise, stop()}.
   * onLevel(0..1) is called while listening, onListening() once the mic is on.
   */
  // opts.language: listen for another language (e.g. "en-US");
  // opts.noScoring: just recognise what was said, without pronunciation scoring.
  function assess(referenceText, onListening, onLevel, opts) {
    opts = opts || {};
    var ctx = audio(); // must run inside the tap
    var stopped = false, cleanup = function () {}, pushStream = null;
    var ctl = { stop: function () { if (!stopped) { stopped = true; if (pushStream) pushStream.close(); } } };
    ctl.promise = new Promise(function (resolve, reject) {
      var cfg;
      try { cfg = speechConfig(); } catch (e) { return reject(e); }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return reject(new Error("This browser can't use the microphone here. Please use Safari."));
      }
      navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).then(function (stream) {
        var RATE = 16000, ratio = ctx.sampleRate / RATE, carry = 0, chunks = [];
        pushStream = SDK.AudioInputStream.createPushStream(SDK.AudioStreamFormat.getWaveFormatPCM(RATE, 16, 1));
        var source = ctx.createMediaStreamSource(stream);
        var proc = ctx.createScriptProcessor(4096, 1, 1);
        var mute = ctx.createGain(); mute.gain.value = 0;
        proc.onaudioprocess = function (e) {
          if (stopped) return;
          var input = e.inputBuffer.getChannelData(0), out = [], pos = carry, peak = 0;
          while (pos < input.length) {
            var i = Math.floor(pos), f = pos - i, a = input[i], b = i + 1 < input.length ? input[i + 1] : a;
            out.push(a + (b - a) * f); pos += ratio;
          }
          carry = pos - input.length;
          var pcm = new Int16Array(out.length);
          for (var k = 0; k < out.length; k++) {
            var s = Math.max(-1, Math.min(1, out[k])); pcm[k] = s < 0 ? s * 0x8000 : s * 0x7fff;
            if (Math.abs(s) > peak) peak = Math.abs(s);
          }
          chunks.push(pcm);
          pushStream.write(pcm.buffer);
          if (onLevel) onLevel(Math.min(1, peak * 1.6));
        };
        source.connect(proc); proc.connect(mute); mute.connect(ctx.destination);
        cleanup = function () {
          try { proc.disconnect(); source.disconnect(); mute.disconnect(); } catch (e) {}
          stream.getTracks().forEach(function (t) { t.stop(); });
        };

        cfg.setProperty(SDK.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs, "8000");
        cfg.setProperty(SDK.PropertyId.Speech_SegmentationSilenceTimeoutMs, "1300");
        if (opts.language) cfg.speechRecognitionLanguage = opts.language;
        var level = scoringLevel();
        var rec = new SDK.SpeechRecognizer(cfg, SDK.AudioConfig.fromStreamInput(pushStream));
        if (!opts.noScoring) scoringConfig(referenceText, level).applyTo(rec);
        var safety = setTimeout(ctl.stop, 20000); // never record forever
        if (onListening) onListening();
        rec.recognizeOnceAsync(function (result) {
          clearTimeout(safety); stopped = true; cleanup(); rec.close();
          var recording = chunks.length ? wavFromChunks(chunks, RATE) : null;
          handleResult(result, level, recording);
        }, function (err) {
          clearTimeout(safety); stopped = true; cleanup(); rec.close();
          failed(String(err), level, chunks.length ? wavFromChunks(chunks, RATE) : null);
        });

        function handleResult(result, lvl, recording) {
          if (result.reason === SDK.ResultReason.RecognizedSpeech) {
            if (!opts.noScoring) rememberScoringLevel(lvl);
            resolve({ json: JSON.parse(result.properties.getProperty(SDK.PropertyId.SpeechServiceResponse_JsonResult)), recording: recording });
          } else if (result.reason === SDK.ResultReason.NoMatch) {
            reject(new Error("I didn't hear any Spanish. Tap Record, then speak clearly towards the iPad."));
          } else {
            failed(SDK.CancellationDetails.fromResult(result).errorDetails, lvl, recording);
          }
        }
        // Azure sometimes refuses the detailed scoring request ("Could not
        // validate speech context", websocket 1007). Then score the SAME
        // recording again with simpler settings — no need to speak twice.
        function failed(details, lvl, recording) {
          if (!opts.noScoring && /1007|1011|speech context|internal (server )?error/i.test(String(details)) && lvl < SCORING_LEVELS.length - 1 && chunks.length) {
            var next = lvl + 1; // remembered only once it actually works (handleResult)
            var replay = SDK.AudioInputStream.createPushStream(SDK.AudioStreamFormat.getWaveFormatPCM(RATE, 16, 1));
            chunks.forEach(function (c) { replay.write(c.buffer.slice(0)); });
            replay.close();
            var cfg2 = speechConfig();
            var rec2 = new SDK.SpeechRecognizer(cfg2, SDK.AudioConfig.fromStreamInput(replay));
            scoringConfig(referenceText, next).applyTo(rec2);
            rec2.recognizeOnceAsync(function (r2) { rec2.close(); handleResult(r2, next, recording); },
              function (e2) { rec2.close(); failed(String(e2), next, recording); });
            return;
          }
          var err = new Error(friendly(details));
          err.recording = recording; // so "Hear myself" still works
          reject(err);
        }
      }).catch(function (err) {
        reject(new Error(err && err.name === "NotAllowedError"
          ? "The microphone is blocked. On iPad: Settings app → Safari → Microphone → Allow (or tap 'aA' in the address bar → Website Settings → Microphone → Allow)."
          : "Could not start the microphone: " + (err && err.message || err)));
      });
    });
    return ctl;
  }

  window.Speech = {
    init: function (s) { store = s; },
    VOICES: VOICES, accent: accent, voiceFor: voiceFor,
    audio: audio, playAudioData: playAudioData, stopPlayback: stopPlayback,
    speak: speak, speakFallback: speakFallback, assess: assess, friendly: friendly,
    clearCache: function () { state.audioCache = {}; },
  };
})();
