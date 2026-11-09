/* Spanish Pronunciation Practice - page logic (runs entirely in the browser) */
(function () {
  "use strict";
  var SDK = window.SpeechSDK;
  var store = new PracticeStore(window.localStorage, window.BUILTIN_DECKS);
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); };
  var colour = function (s) { return SpanishSounds.colourFor(s); };
  var SOUND_LABELS = {};
  Object.keys(SpanishSounds.SOUNDS).forEach(function (k) { SOUND_LABELS[k] = SpanishSounds.SOUNDS[k].label; });

  var state = { item: null, why: "", deck: "All", recent: [], shown: [], attemptsThisItem: [],
                recording: null, lastRecording: null, audioCache: {} };
  try { state.deck = localStorage.getItem("spanishPractice.deck") || "All"; } catch (e) {}
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});

  function setStatus(msg, isError) {
    var el = $("status"); el.textContent = msg || ""; el.className = "status" + (isError ? " error" : "");
  }
  function isStandalone() {
    return window.navigator.standalone === true || (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
  }
  function isTouchApple() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  }

  // ------------------------------------------------------------ audio engine
  // iPads only allow sound that starts from a tap, so every button first
  // "unlocks" one shared AudioContext, and all sound goes through it.
  var AC = null, currentSource = null;
  function audio() {
    if (!AC) {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      var b = AC.createBuffer(1, 1, 22050), s = AC.createBufferSource(); // silent unlock
      s.buffer = b; s.connect(AC.destination); s.start(0);
    }
    if (AC.state === "suspended") AC.resume();
    return AC;
  }
  function stopPlayback() { if (currentSource) { try { currentSource.stop(); } catch (e) {} currentSource = null; } }
  function playBuffer(buf) {
    var ctx = audio();
    stopPlayback();
    var src = ctx.createBufferSource();
    src.buffer = buf; src.connect(ctx.destination);
    currentSource = src;
    return new Promise(function (resolve) { src.onended = function () { if (currentSource === src) currentSource = null; resolve(); }; src.start(0); });
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
    cfg.speechRecognitionLanguage = "es-ES";
    return cfg;
  }
  function friendly(details) {
    var d = String(details || "");
    if (/401|403|auth|subscription|key/i.test(d)) return "Azure refused the key. Check KEY 1 and the region on the Setup tab. (" + d + ")";
    if (/quota|429|throttl/i.test(d)) return "The free Azure allowance is used up for now (free tier limit). Try again later. (" + d + ")";
    if (/1006|websocket|network|connect/i.test(d)) return "Could not connect to Azure. Check the Wi-Fi and that the region is correct. (" + d + ")";
    return "Azure problem: " + d;
  }

  // Listen: Azure's Spain voice. The audio is kept in memory so replays are free.
  function speak(text, slow) {
    var ctx = audio();
    var s = store.settings(), rate = slow ? "-40%" : (s.speed || "-15%"), voice = s.voice || "es-ES-ElviraNeural";
    var cacheKey = voice + "|" + rate + "|" + text;
    if (state.audioCache[cacheKey]) return playBuffer(state.audioCache[cacheKey]);
    return new Promise(function (resolve, reject) {
      var cfg;
      try { cfg = speechConfig(); } catch (e) { return reject(e); }
      cfg.speechSynthesisOutputFormat = SDK.SpeechSynthesisOutputFormat.Audio24Khz48KBitRateMonoMp3;
      var synth = new SDK.SpeechSynthesizer(cfg, null);
      var ssml = '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="es-ES">' +
        '<voice name="' + esc(voice) + '"><prosody rate="' + esc(rate) + '">' + esc(text) + "</prosody></voice></speak>";
      synth.speakSsmlAsync(ssml, function (result) {
        synth.close();
        if (result.reason === SDK.ResultReason.SynthesizingAudioCompleted) resolve(result.audioData);
        else reject(new Error(friendly(result.errorDetails)));
      }, function (err) { synth.close(); reject(new Error(friendly(err))); });
    }).then(decode).then(function (buf) {
      state.audioCache[cacheKey] = buf;
      if (ctx.state !== "running") ctx.resume();
      return playBuffer(buf);
    });
  }
  function speakFallback(text, slow) {
    if (!window.speechSynthesis) return false;
    var u = new SpeechSynthesisUtterance(text);
    u.lang = "es-ES"; u.rate = slow ? 0.6 : 0.85;
    var v = speechSynthesis.getVoices().filter(function (v) { return v.lang === "es-ES"; })[0];
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

  /*
   * Record and score. Returns a controller {promise, stop()}.
   * onLevel(0..1) is called while listening, onListening() once the mic is on.
   */
  function assess(referenceText, onListening, onLevel) {
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
        var rec = new SDK.SpeechRecognizer(cfg, SDK.AudioConfig.fromStreamInput(pushStream));
        var pa = new SDK.PronunciationAssessmentConfig(referenceText,
          SDK.PronunciationAssessmentGradingSystem.HundredMark, SDK.PronunciationAssessmentGranularity.Phoneme, true);
        pa.applyTo(rec);
        var safety = setTimeout(ctl.stop, 20000); // never record forever
        if (onListening) onListening();
        rec.recognizeOnceAsync(function (result) {
          clearTimeout(safety); stopped = true; cleanup(); rec.close();
          var recording = chunks.length ? wavFromChunks(chunks, RATE) : null;
          if (result.reason === SDK.ResultReason.RecognizedSpeech) {
            resolve({ json: JSON.parse(result.properties.getProperty(SDK.PropertyId.SpeechServiceResponse_JsonResult)), recording: recording });
          } else if (result.reason === SDK.ResultReason.NoMatch) {
            reject(new Error("I didn't hear any Spanish. Tap Record, then speak clearly towards the iPad."));
          } else {
            reject(new Error(friendly(SDK.CancellationDetails.fromResult(result).errorDetails)));
          }
        }, function (err) {
          clearTimeout(safety); stopped = true; cleanup(); rec.close();
          reject(new Error(friendly(err)));
        });
      }).catch(function (err) {
        reject(new Error(err && err.name === "NotAllowedError"
          ? "The microphone is blocked. On iPad: Settings app → Safari → Microphone → Allow (or tap 'aA' in the address bar → Website Settings → Microphone → Allow)."
          : "Could not start the microphone: " + (err && err.message || err)));
      });
    });
    return ctl;
  }

  // ------------------------------------------------------------ practice screen
  function fillDecks() {
    var decks = store.decks(), items = store.items();
    var sel = $("deck");
    sel.innerHTML = '<option value="All">All decks (' + items.length + ")</option>" + decks.map(function (d) {
      var n = items.filter(function (i) { return i.deck === d; }).length;
      return '<option value="' + esc(d) + '">' + esc(d) + " (" + n + ")</option>";
    }).join("");
    if (state.deck !== "All" && decks.indexOf(state.deck) < 0) state.deck = "All";
    sel.value = state.deck;
    $("deck-names").innerHTML = decks.map(function (d) { return '<option value="' + esc(d) + '">'; }).join("");
  }
  function nextItem() {
    var res = store.chooseNext(state.deck, state.recent, state.shown, Date.now());
    if (!res.item) { setStatus("This deck is empty."); return; }
    showItem(res.item, res.why);
  }
  var WHY = { "new": "New", review: "Review: due now", extra: "Extra practice" };
  function showItem(item, why) {
    state.item = item; state.why = why || ""; state.attemptsThisItem = []; state.lastRecording = null;
    if (state.shown.indexOf(item.id) < 0) state.shown.push(item.id);
    state.recent = state.recent.filter(function (id) { return id !== item.id; }).concat([item.id]).slice(-3);
    $("es").textContent = item.es; $("en").textContent = item.en || "—"; $("fr").textContent = item.fr || "—";
    $("why").textContent = (WHY[why] ? WHY[why] + " · " : "") + item.deck;
    $("result").classList.add("hidden");
    $("btn-me").disabled = true;
    setStatus("");
  }
  function listen(slow) {
    if (!state.item || state.recording) return;
    audio();
    setStatus(slow ? "Playing slowly…" : "Playing…");
    speak(state.item.es, slow).then(function () { if (/^Playing/.test($("status").textContent)) setStatus(""); })
      .catch(function (e) {
        if (speakFallback(state.item.es, slow)) setStatus("Using the iPad's own voice because Azure didn't answer: " + e.message, true);
        else setStatus(e.message + (e.help ? " " + e.help : ""), true);
      });
  }
  function record() {
    if (!state.item) return;
    if (state.recording) { state.recording.stop(); return; } // second tap = stop
    stopPlayback();
    var btn = $("btn-record"), item = state.item, level = $("rec-level"), bar = $("rec-level-bar");
    btn.textContent = "⏳ Starting…";
    setStatus("Starting the microphone…");
    var ctl = assess(item.es, function () {
      btn.classList.add("recording"); btn.textContent = "⏹ Stop";
      level.classList.remove("hidden");
      setStatus("Speak now: “" + item.es + "”. It stops by itself when you finish.");
    }, function (v) { bar.style.width = Math.round(v * 100) + "%"; });
    state.recording = ctl;
    ctl.promise.then(function (res) {
      if (state.item !== item) return;
      var a = SpanishSounds.analyse(item.es, res.json);
      var first = state.attemptsThisItem.length === 0;
      state.attemptsThisItem.push(a.overall);
      showResult(a);
      if (res.recording) {
        decode(res.recording).then(function (buf) { state.lastRecording = buf; $("btn-me").disabled = false; }).catch(function () {});
      }
      var saved = store.recordAttempt({ item_id: item.id, first: first, overall: a.overall, accuracy: a.accuracy,
        fluency: a.fluency, completeness: a.completeness, sounds: a.sounds });
      setStatus(saved.saved ? (first ? "Tap 🎤 Record to try again, or Next ➡ to move on." : "Try as often as you like.")
                            : "Warning: your result could not be saved (iPad storage full or blocked).", !saved.saved);
    }).catch(function (e) {
      setStatus(e.message + (e.help ? " " + e.help : ""), true);
    }).then(function () {
      state.recording = null;
      btn.classList.remove("recording"); btn.textContent = "🎤 Record";
      level.classList.add("hidden"); bar.style.width = "0";
    });
  }
  function markWord(w) {
    var text = w.text, clean = w.clean, marks = (w.problems || []).filter(function (p) { return p.spelling; });
    if (!marks.length) return esc(text);
    var map = [], ci = 0;
    for (var i = 0; i < text.length && ci < clean.length; i++) if (text[i].toLowerCase() === clean[ci]) { map[ci] = i; ci++; }
    var under = {};
    marks.forEach(function (p) { for (var k = p.start; k < p.end; k++) if (map[k] != null) under[map[k]] = true; });
    var out = "";
    for (var j = 0; j < text.length; j++) out += under[j] ? "<u>" + esc(text[j]) + "</u>" : esc(text[j]);
    return out.replace(/<\/u><u>/g, "");
  }
  function showResult(a) {
    var setNum = function (id, v) { var el = $(id); el.textContent = v; el.className = "num " + colour(v); };
    setNum("s-overall", a.overall); setNum("s-accuracy", a.accuracy); setNum("s-fluency", a.fluency); setNum("s-complete", a.completeness);
    var wordsEl = $("words");
    wordsEl.innerHTML = a.words.map(function (w, i) {
      return '<button class="word ' + w.colour + '" data-i="' + i + '">' + markWord(w) + "<small>" + w.score + "</small></button>";
    }).join("");
    var tips = [];
    a.words.forEach(function (w) {
      (w.problems || []).forEach(function (p) {
        if (p.message) tips.push('<div class="tip"><b class="w">' + esc(w.text) + "</b> — " + esc(p.message) + "</div>");
        else tips.push('<div class="tip"><b class="w">' + esc(w.text) + '</b> — <span class="snd">' + esc(p.spelling) + "</span> " +
          esc(p.label) + " (" + p.score + "). " + esc(p.tip) + "</div>");
      });
    });
    if (a.inserted.length) tips.push('<div class="tip">Extra words I heard that are not in the sentence: <b>' + esc(a.inserted.join(", ")) + "</b></div>");
    if (!tips.length) tips.push('<div class="tip great">¡Muy bien! Every word sounded good.</div>');
    $("tips").innerHTML = tips.join("");
    var att = state.attemptsThisItem;
    $("attempts").textContent = "Attempts on this item: " + att.length + " · best " + Math.max.apply(null, att) +
      (att.length > 1 ? " · scores " + att.join(" → ") : "") + (a.heard ? " · Azure heard: “" + a.heard + "”" : "");
    $("result").classList.remove("hidden");
    Array.prototype.forEach.call(wordsEl.querySelectorAll(".word"), function (el) {
      el.addEventListener("click", function () {
        var w = a.words[+el.dataset.i];
        Array.prototype.forEach.call(wordsEl.querySelectorAll(".word"), function (x) { x.classList.remove("selected"); });
        el.classList.add("selected");
        var old = $("unit-detail"); if (old) old.remove();
        if (!w.units) return;
        var d = document.createElement("div");
        d.id = "unit-detail"; d.className = "tip";
        d.innerHTML = "<b>" + esc(w.text) + "</b>, sound by sound" + (w.units.length && !w.units[0].exact ? " (approximate)" : "") +
          ':<div class="units">' + w.units.map(function (u) {
            return '<span class="unit ' + colour(u.score) + '">' + esc(u.spelling) + " <small>" + esc(u.label) + "</small> " + u.score + "</span>";
          }).join("") + "</div>";
        $("tips").prepend(d);
      });
    });
  }

  // ------------------------------------------------------------ progress screen
  function loadProgress() {
    var p = store.progress(SOUND_LABELS, Date.now());
    var tiles = [[p.items_practised + " / " + p.items_total, "items practised"], [p.total_attempts, "recordings made"],
                 [p.due_now, "due for review now"], [p.mastered, "items mastered"]];
    $("tiles").innerHTML = tiles.map(function (t) { return '<div class="tile"><div class="v">' + t[0] + '</div><div class="l">' + t[1] + "</div></div>"; }).join("");
    drawChart(p.daily);
    $("sound-list").innerHTML = p.sounds.length ? p.sounds.slice(0, 12).map(function (s) {
      var info = SpanishSounds.SOUNDS[s.key] || {};
      return '<details class="bar-detail"><summary class="bar-row"><span>' + esc(s.label) + '</span><span class="bar-track"><span class="bar-fill ' +
        colour(s.avg) + '" style="width:' + Math.max(2, s.avg) + '%"></span></span><span class="val">' + Math.round(s.avg) + "</span></summary>" +
        (info.tip ? '<div class="bar-tip">' + esc(info.tip) + "</div>" : "") + "</details>";
    }).join("") + '<p class="hint">Weakest first, from your recent recordings. Tap a sound for a tip.</p>'
      : '<div class="empty">Practise a few items and your sounds will appear here.</div>';
    $("weak-list").innerHTML = p.weak_items.length ? p.weak_items.slice(0, 10).map(function (w) {
      return '<div class="list-row"><span>' + esc(w.es) + ' <span class="meta">· ' + esc(w.deck) + '</span></span><span class="row-end"><span class="pill ' +
        colour(w.last_score) + '">' + w.last_score + '</span> <button class="small-btn" data-practise="' + esc(w.id) + '">Practise</button></span></div>';
    }).join("") : '<div class="empty">Nothing yet.</div>';
  }
  function drawChart(daily) {
    var el = $("chart");
    if (!daily.length) { el.innerHTML = '<div class="empty">Your daily average will appear here after your first practice.</div>'; return; }
    var W = 860, H = 260, L = 40, R = 16, T = 14, B = 34;
    var x = function (i) { return daily.length === 1 ? (L + W - R) / 2 : L + i * (W - L - R) / (daily.length - 1); };
    var y = function (v) { return T + (100 - v) * (H - T - B) / 100; };
    var svg = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Average score per day">';
    [0, 25, 50, 75, 100].forEach(function (v) {
      svg += '<line class="gridline" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>' +
        '<text class="axis" x="' + (L - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + v + "</text>";
    });
    var step = Math.max(1, Math.ceil(daily.length / 8));
    daily.forEach(function (d, i) {
      if (i % step === 0 || i === daily.length - 1) svg += '<text class="axis" x="' + x(i) + '" y="' + (H - 10) + '" text-anchor="middle">' + d.day.slice(5) + "</text>";
    });
    if (daily.length > 1) svg += '<polyline class="series" points="' + daily.map(function (d, i) { return x(i) + "," + y(d.avg); }).join(" ") + '"/>';
    daily.forEach(function (d, i) {
      var hw = daily.length === 1 ? 40 : (W - L - R) / (daily.length - 1) / 2;
      svg += '<circle class="pt" cx="' + x(i) + '" cy="' + y(d.avg) + '" r="5"/>' +
        '<rect class="hit" x="' + (x(i) - hw) + '" y="' + T + '" width="' + 2 * hw + '" height="' + (H - T - B) + '" data-tip="' +
        esc(d.day + ": average " + d.avg + " (" + d.count + " items)") + '"/>';
    });
    el.innerHTML = svg + '</svg><div class="chart-readout" id="chart-readout">Tap a point to see its value.</div>';
    Array.prototype.forEach.call(el.querySelectorAll(".hit"), function (n) {
      var show = function () { $("chart-readout").textContent = n.getAttribute("data-tip"); };
      n.addEventListener("click", show); n.addEventListener("mouseenter", show);
    });
  }
  function backup() {
    var name = "spanish-practice-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    var blob = new Blob([store.exportJSON(false)], { type: "application/json" });
    var file = window.File ? new File([blob], name, { type: "application/json" }) : null;
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: "Spanish practice backup" }).catch(function () {});
      return;
    }
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }

  // ------------------------------------------------------------ my words screen
  function loadWordList() {
    fillDecks();
    var items = store.items(), html = "";
    store.decks().forEach(function (d) {
      html += '<div class="deck-title">' + esc(d) + "</div>";
      items.filter(function (i) { return i.deck === d; }).forEach(function (i) {
        var sc = i.last_score;
        html += '<div class="list-row"><span>' + esc(i.es) + ' <span class="meta">' + esc(i.en || "") + (i.fr ? " · " + esc(i.fr) : "") + '</span></span><span class="row-end">' +
          '<span class="pill ' + (sc == null ? "none" : colour(sc)) + '">' + (sc == null ? "new" : sc) + "</span> " +
          '<button class="small-btn" data-practise="' + esc(i.id) + '">Practise</button>' +
          (i.custom ? ' <button class="small-btn" data-delete="' + esc(i.id) + '">Delete</button>' : "") + "</span></div>";
      });
    });
    $("all-items").innerHTML = html;
  }

  // ------------------------------------------------------------ setup
  function check(id, ok, html, mark) {
    var li = $(id); li.classList.remove("pass", "fail");
    if (ok !== null) li.classList.add(ok ? "pass" : "fail");
    li.querySelector(".mark").textContent = mark || (ok ? "✓" : ok === false ? "✗" : "…");
    li.querySelector(".chk-body").innerHTML = html;
  }
  function checkSettings() {
    var s = store.settings();
    $("region-input").value = s.region || "";
    $("voice-input").value = s.voice; $("speed-input").value = s.speed;
    if (!Store_keyOk(s.key)) check("chk-settings", false, "Paste <b>KEY 1</b> and the <b>Location/Region</b> from your Azure Speech resource (page “Keys and Endpoint”), then tap Save.");
    else if (!s.region) check("chk-settings", false, "The key is saved, but the region is missing (for example <code>westeurope</code>).");
    else check("chk-settings", true, "Key saved on this iPad (ending in …" + esc(s.key.slice(-4)) + "). Region: <b>" + esc(s.region) + "</b>. To change it, paste a new key below.");
    var home = isStandalone();
    check("chk-home", home, home ? "Opened from the Home Screen. Your results are kept safely."
      : "In Safari, tap the <b>Share</b> button (square with an arrow) → <b>Add to Home Screen</b> → <b>Add</b>. Then always open the program from that icon: this keeps your results safe (Safari can delete data from websites you haven't visited for a while).");
  }
  function Store_keyOk(k) { return PracticeStore.keyLooksValid(k); }
  function checkAzure() {
    check("chk-azure", null, "Contacting Azure…");
    speak("Hola, vamos a practicar.", false).then(function () {
      check("chk-azure", true, "Connected to Azure. You should have heard “Hola, vamos a practicar.” If you heard nothing, turn up the volume and check the iPad is not muted.");
    }).catch(function (e) { check("chk-azure", false, esc(e.message) + (e.help ? "<br>" + esc(e.help) : "")); });
  }
  function checkMic() {
    audio();
    if (!navigator.mediaDevices) { check("chk-mic", false, "This browser can't use the microphone here. Please use Safari."); return; }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      var ctx = audio(), an = ctx.createAnalyser(); an.fftSize = 512;
      var src = ctx.createMediaStreamSource(stream); src.connect(an);
      var data = new Uint8Array(an.fftSize), peak = 0, t0 = Date.now();
      $("meter").classList.remove("hidden");
      check("chk-mic", null, "Say something now… the green bar should move.", "🎤");
      (function loop() {
        an.getByteTimeDomainData(data);
        var max = 0; for (var i = 0; i < data.length; i++) max = Math.max(max, Math.abs(data[i] - 128));
        var level = Math.min(100, max / 128 * 160); peak = Math.max(peak, level);
        $("meter-bar").style.width = level + "%";
        if (Date.now() - t0 < 6000) return requestAnimationFrame(loop);
        src.disconnect(); stream.getTracks().forEach(function (t) { t.stop(); });
        $("meter").classList.add("hidden");
        if (peak > 12) check("chk-mic", true, "Your microphone works.");
        else check("chk-mic", false, "The microphone is allowed but I heard almost nothing. Remove any case covering the microphone and try again.");
      })();
    }).catch(function () {
      check("chk-mic", false, "The microphone is blocked. Tap <b>aA</b> in Safari's address bar → <b>Website Settings</b> → <b>Microphone</b> → <b>Allow</b>, then test again.");
    });
  }
  function checkPron() {
    if (state.recording) return;
    check("chk-pron", null, "Starting the microphone…");
    var ctl = assess("Hola, buenos días", function () { check("chk-pron", null, "🔴 Say: <b>“Hola, buenos días”</b>", "🎤"); });
    state.recording = ctl;
    ctl.promise.then(function (res) {
      var a = SpanishSounds.analyse("Hola, buenos días", res.json);
      check("chk-pron", true, "It works! Your score: <b>" + a.overall + "</b> (accuracy " + a.accuracy + ", fluency " + a.fluency + "). " +
        a.words.map(function (w) { return '<span class="pill ' + w.colour + '">' + esc(w.text) + " " + w.score + "</span>"; }).join(" ") +
        "<br>Everything is ready. Go to <b>Practise</b>.");
    }).catch(function (e) { check("chk-pron", false, esc(e.message) + (e.help ? "<br>" + esc(e.help) : "")); })
      .then(function () { state.recording = null; });
  }

  // ------------------------------------------------------------ navigation & events
  function showView(name) {
    Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (t) { t.classList.toggle("active", t.dataset.view === name); });
    Array.prototype.forEach.call(document.querySelectorAll(".view"), function (v) { v.classList.toggle("active", v.id === "view-" + name); });
    if (name === "progress") loadProgress();
    if (name === "words") loadWordList();
    if (name === "setup") checkSettings();
    window.scrollTo(0, 0);
  }
  function practiseById(id) {
    var item = store.items().filter(function (i) { return i.id === id; })[0];
    if (item) { showView("practice"); showItem(item, "extra"); }
  }

  Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (t) { t.addEventListener("click", function () { showView(t.dataset.view); }); });
  $("btn-listen").addEventListener("click", function () { listen(false); });
  $("btn-slow").addEventListener("click", function () { listen(true); });
  $("btn-record").addEventListener("click", record);
  $("btn-me").addEventListener("click", function () { if (state.lastRecording && !state.recording) playBuffer(state.lastRecording); });
  $("btn-next").addEventListener("click", function () { if (!state.recording) { stopPlayback(); nextItem(); } });
  $("deck").addEventListener("change", function (e) {
    state.deck = e.target.value; try { localStorage.setItem("spanishPractice.deck", state.deck); } catch (er) {}
    nextItem();
  });
  document.addEventListener("click", function (e) {
    var p = e.target.closest && e.target.closest("[data-practise]");
    if (p) practiseById(p.dataset.practise);
    var d = e.target.closest && e.target.closest("[data-delete]");
    if (d && confirm("Delete this item?")) { store.deleteItem(d.dataset.delete); loadWordList(); }
  });
  document.addEventListener("keydown", function (e) {
    if (!$("view-practice").classList.contains("active") || e.target.matches("input, select, textarea") || e.metaKey || e.ctrlKey || e.altKey) return;
    var k = e.key.toLowerCase();
    if (k === "l") listen(false); else if (k === "s") listen(true); else if (k === "r") record();
    else if (k === "m") $("btn-me").click(); else if (k === "n") $("btn-next").click();
  });
  $("add-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var res = store.addItem($("add-es").value, $("add-en").value, $("add-fr").value, $("add-deck").value);
    if (res.error) { $("add-msg").textContent = res.error; return; }
    $("add-msg").textContent = "Added “" + res.item.es + "” to " + res.item.deck + ".";
    $("add-es").value = $("add-en").value = $("add-fr").value = "";
    loadWordList();
  });
  $("add-listen").addEventListener("click", function () {
    var t = $("add-es").value.trim();
    if (t) speak(t, false).catch(function (er) { $("add-msg").textContent = er.message; });
  });
  $("key-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var patch = { region: $("region-input").value, voice: $("voice-input").value, speed: $("speed-input").value };
    var key = $("key-input").value.trim();
    if (key) patch.key = key;
    else if (!store.settings().key) { check("chk-settings", false, "Please paste KEY 1 first."); return; }
    var err = store.saveSettings(patch);
    if (err) { check("chk-settings", false, esc(err)); return; }
    $("key-input").value = ""; state.audioCache = {};
    checkSettings();
    if (store.isConfigured()) checkAzure();
  });
  $("run-azure").addEventListener("click", checkAzure);
  $("run-mic").addEventListener("click", checkMic);
  $("run-pron").addEventListener("click", checkPron);
  $("btn-backup").addEventListener("click", backup);
  $("restore-file").addEventListener("change", function (e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      if (!confirm("Replace the results on this iPad with the ones in this backup?")) return;
      var err = store.importJSON(String(r.result));
      $("backup-msg").textContent = err || "Backup restored.";
      fillDecks(); loadProgress();
    };
    r.readAsText(f); e.target.value = "";
  });
  $("home-hint-close").addEventListener("click", function () { $("home-hint").classList.add("hidden"); });

  // ------------------------------------------------------------ start
  fillDecks();
  nextItem();
  if (isTouchApple() && !isStandalone()) $("home-hint").classList.remove("hidden");
  if (!store.isConfigured()) showView("setup");
})();
