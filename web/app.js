/* Spanish Pronunciation Practice - page logic */
(function () {
  "use strict";
  var SDK = window.SpeechSDK;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); };

  var state = {
    item: null, why: "", deck: "All", recent: [], shown: [], attemptsThisItem: [], recording: false,
    lastRecordingUrl: null, items: [], decks: [], auth: null, audioCache: {},
  };
  try { state.deck = localStorage.getItem("deck") || "All"; } catch (e) {}

  // ------------------------------------------------------------ helpers
  function api(path, body) {
    var opts = body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {};
    return fetch(path, opts).then(function (r) { return r.json(); });
  }
  function setStatus(msg, isError) {
    var el = $("status"); el.textContent = msg || ""; el.className = "status" + (isError ? " error" : "");
  }
  function colour(s) { return SpanishSounds.colourFor(s); }

  // Azure login: ask our local program for a short-lived token (cached 8 minutes).
  function getAuth(force) {
    var now = Date.now();
    if (!force && state.auth && state.auth.expires > now) return Promise.resolve(state.auth);
    return api("/api/token").then(function (res) {
      if (!res.ok) { var e = new Error(res.error); e.help = res.help; throw e; }
      res.expires = now + 8 * 60 * 1000;
      state.auth = res;
      return res;
    });
  }
  function speechConfig(auth) {
    var cfg = auth.mode === "key" ? SDK.SpeechConfig.fromSubscription(auth.key, auth.region)
                                   : SDK.SpeechConfig.fromAuthorizationToken(auth.token, auth.region);
    cfg.speechRecognitionLanguage = "es-ES";
    return cfg;
  }

  // ------------------------------------------------------------ listening (text to speech)
  function rateFor(slow, auth) {
    if (slow) return "-40%";
    return (auth && auth.speed) || "-15%";
  }
  function speak(text, slow) {
    return getAuth().then(function (auth) {
      var rate = rateFor(slow, auth), voice = auth.voice || "es-ES-ElviraNeural";
      var cacheKey = voice + "|" + rate + "|" + text;
      if (state.audioCache[cacheKey]) return playUrl(state.audioCache[cacheKey]);
      var cfg = speechConfig(auth);
      cfg.speechSynthesisOutputFormat = SDK.SpeechSynthesisOutputFormat.Audio24Khz48KBitRateMonoMp3;
      var synth = new SDK.SpeechSynthesizer(cfg, null);
      var ssml = '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="es-ES">' +
        '<voice name="' + esc(voice) + '"><prosody rate="' + esc(rate) + '">' + esc(text) + "</prosody></voice></speak>";
      return new Promise(function (resolve, reject) {
        synth.speakSsmlAsync(ssml, function (result) {
          synth.close();
          if (result.reason === SDK.ResultReason.SynthesizingAudioCompleted) {
            var url = URL.createObjectURL(new Blob([result.audioData], { type: "audio/mpeg" }));
            state.audioCache[cacheKey] = url;
            playUrl(url).then(resolve, reject);
          } else {
            reject(new Error(result.errorDetails || "Azure could not create the audio."));
          }
        }, function (err) { synth.close(); reject(new Error(err)); });
      });
    }).catch(function (err) {
      // Fallback: the computer's own Spanish voice (lower quality, but works offline).
      if (window.speechSynthesis) {
        var u = new SpeechSynthesisUtterance(text);
        u.lang = "es-ES"; u.rate = slow ? 0.6 : 0.85;
        var v = speechSynthesis.getVoices().filter(function (v) { return v.lang === "es-ES"; })[0];
        if (v) u.voice = v;
        speechSynthesis.cancel(); speechSynthesis.speak(u);
        setStatus("Using your computer's built-in voice because Azure is not connected (" + err.message + ").", true);
        return;
      }
      throw err;
    });
  }
  var player = new Audio();
  function playUrl(url) {
    player.pause(); player.src = url;
    return player.play();
  }

  // ------------------------------------------------------------ recording + assessment
  function assess(referenceText, onListening) {
    return getAuth().then(function (auth) {
      var cfg = speechConfig(auth);
      cfg.setProperty(SDK.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs, "8000");
      cfg.setProperty(SDK.PropertyId.Speech_SegmentationSilenceTimeoutMs, "1300");
      var audio = SDK.AudioConfig.fromDefaultMicrophoneInput();
      var rec = new SDK.SpeechRecognizer(cfg, audio);
      var pa = new SDK.PronunciationAssessmentConfig(referenceText,
        SDK.PronunciationAssessmentGradingSystem.HundredMark, SDK.PronunciationAssessmentGranularity.Phoneme, true);
      pa.applyTo(rec);
      // our own copy of the recording, for "Hear myself"
      var mediaRec = null, chunks = [];
      var copy = navigator.mediaDevices && window.MediaRecorder ? navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
        mediaRec = new MediaRecorder(stream);
        mediaRec.ondataavailable = function (e) { if (e.data.size) chunks.push(e.data); };
        mediaRec.start();
      }).catch(function () {}) : Promise.resolve();

      return copy.then(function () {
        if (onListening) onListening();
        return new Promise(function (resolve, reject) {
          rec.recognizeOnceAsync(function (result) {
            rec.close();
            var finish = function (recordingUrl) {
              if (result.reason === SDK.ResultReason.RecognizedSpeech) {
                var json = JSON.parse(result.properties.getProperty(SDK.PropertyId.SpeechServiceResponse_JsonResult));
                resolve({ json: json, recordingUrl: recordingUrl });
              } else if (result.reason === SDK.ResultReason.NoMatch) {
                reject(new Error("I didn't hear any Spanish. Press Record, wait a moment, then speak clearly into the microphone."));
              } else {
                var c = SDK.CancellationDetails.fromResult(result);
                reject(new Error(friendlyCancel(c)));
              }
            };
            if (mediaRec && mediaRec.state !== "inactive") {
              mediaRec.onstop = function () {
                mediaRec.stream.getTracks().forEach(function (t) { t.stop(); });
                finish(chunks.length ? URL.createObjectURL(new Blob(chunks, { type: chunks[0].type })) : null);
              };
              mediaRec.stop();
            } else finish(null);
          }, function (err) {
            rec.close();
            if (mediaRec && mediaRec.state !== "inactive") { mediaRec.stop(); mediaRec.stream.getTracks().forEach(function (t) { t.stop(); }); }
            reject(new Error(String(err)));
          });
        });
      });
    });
  }
  function friendlyCancel(c) {
    var d = (c && c.errorDetails) || "";
    if (/microphone|getUserMedia|NotAllowed|Permission/i.test(d)) return "The browser could not use your microphone. Click the microphone/lock icon in the address bar and choose 'Allow'.";
    if (/1006|websocket|network/i.test(d)) return "Could not connect to Azure. Check your internet connection. (" + d + ")";
    if (/401|403|auth/i.test(d)) return "Azure refused the key. Open the 'Setup check' tab. (" + d + ")";
    if (/quota|429|throttl/i.test(d)) return "The free Azure allowance is used up for now (free tier limit). Try again later. (" + d + ")";
    return "Azure stopped the recording: " + d;
  }

  // ------------------------------------------------------------ practice screen
  function loadItems() {
    return api("/api/items").then(function (res) {
      state.items = res.items; state.decks = res.decks;
      var sel = $("deck");
      sel.innerHTML = '<option value="All">All decks</option>' + res.decks.map(function (d) {
        var n = res.items.filter(function (i) { return i.deck === d; }).length;
        return '<option value="' + esc(d) + '">' + esc(d) + " (" + n + ")</option>";
      }).join("");
      if (state.deck !== "All" && res.decks.indexOf(state.deck) < 0) state.deck = "All";
      sel.value = state.deck;
      $("deck-names").innerHTML = res.decks.map(function (d) { return '<option value="' + esc(d) + '">'; }).join("");
    });
  }
  function nextItem() {
    var q = "/api/next?deck=" + encodeURIComponent(state.deck) + "&exclude=" + encodeURIComponent(state.recent.join(",")) +
      "&shown=" + encodeURIComponent(state.shown.slice(-200).join(","));
    return api(q).then(function (res) {
      if (!res.item) { setStatus("This deck is empty."); return; }
      showItem(res.item, res.why);
    });
  }
  var WHY = { "new": "New", review: "Review — due now", extra: "Extra practice" };
  function showItem(item, why) {
    state.item = item; state.why = why || "";
    state.attemptsThisItem = [];
    if (state.shown.indexOf(item.id) < 0) state.shown.push(item.id);
    state.recent = state.recent.filter(function (id) { return id !== item.id; }).concat([item.id]).slice(-3);
    $("es").textContent = item.es; $("en").textContent = item.en || "—"; $("fr").textContent = item.fr || "—";
    $("why").textContent = (WHY[why] || "") + (item.deck ? (WHY[why] ? " · " : "") + item.deck : "");
    $("result").classList.add("hidden");
    $("btn-me").disabled = true;
    state.lastRecordingUrl = null;
    setStatus("");
  }
  function listen(slow) {
    if (!state.item) return;
    setStatus(slow ? "Playing slowly…" : "Playing…");
    speak(state.item.es, slow).then(function () { if ($("status").textContent.indexOf("Playing") === 0) setStatus(""); })
      .catch(function (e) { setStatus("Could not play the audio: " + e.message, true); });
  }
  function record() {
    if (!state.item || state.recording) return;
    state.recording = true;
    var btn = $("btn-record");
    btn.disabled = true; btn.textContent = "⏳ Connecting…";
    setStatus("Connecting…");
    var item = state.item;
    assess(item.es, function () {
      btn.disabled = false; btn.classList.add("recording"); btn.textContent = "🔴 Listening…";
      setStatus("Speak now: “" + item.es + "”. It stops by itself when you finish.");
    }).then(function (res) {
      if (state.item !== item) return;
      var a = SpanishSounds.analyse(item.es, res.json);
      var first = state.attemptsThisItem.length === 0;
      state.attemptsThisItem.push(a.overall);
      showResult(a);
      if (res.recordingUrl) { state.lastRecordingUrl = res.recordingUrl; $("btn-me").disabled = false; }
      setStatus(first ? "Press 🎤 Record to try again, or Next ➡ to move on." : "Try as often as you like.");
      return api("/api/attempt", {
        item_id: item.id, first: first, overall: a.overall, accuracy: a.accuracy, fluency: a.fluency, completeness: a.completeness,
        words: a.words.map(function (w) { return { w: w.clean, score: w.score, error: w.error }; }),
        sounds: a.sounds,
      });
    }).catch(function (e) {
      setStatus(e.message + (e.help ? " " + e.help : ""), true);
    }).then(function () {
      state.recording = false;
      btn.disabled = false; btn.classList.remove("recording"); btn.textContent = "🎤 Record";
    });
  }
  function markWord(w, problems) {
    // underline the weak letters inside the word
    var text = w.text, clean = w.clean, marks = (problems || []).filter(function (p) { return p.spelling; });
    if (!marks.length) return esc(text);
    // map positions in the clean word back to the displayed word
    var map = [], ci = 0;
    for (var i = 0; i < text.length && ci < clean.length; i++) { if (text[i].toLowerCase() === clean[ci]) { map[ci] = i; ci++; } }
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
      return '<span class="word ' + w.colour + '" data-i="' + i + '" title="Click to see each sound">' + markWord(w, w.problems) +
        "<small>" + w.score + "</small></span>";
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
    // click a word to see all its sounds
    Array.prototype.forEach.call(wordsEl.querySelectorAll(".word"), function (el) {
      el.addEventListener("click", function () {
        var w = a.words[+el.dataset.i];
        Array.prototype.forEach.call(wordsEl.querySelectorAll(".word"), function (x) { x.classList.remove("selected"); });
        el.classList.add("selected");
        var old = document.getElementById("unit-detail"); if (old) old.remove();
        if (!w.units) return;
        var d = document.createElement("div");
        d.id = "unit-detail"; d.className = "tip";
        d.innerHTML = "<b>" + esc(w.text) + "</b>, sound by sound" +
          (w.units.length && !w.units[0].exact ? " (approximate)" : "") + ':<div class="units">' +
          w.units.map(function (u) { return '<span class="unit ' + colour(u.score) + '" title="' + esc(u.label) + '">' + esc(u.spelling) + " " + u.score + "</span>"; }).join("") + "</div>";
        $("tips").prepend(d);
      });
    });
  }

  // ------------------------------------------------------------ progress screen
  function loadProgress() {
    api("/api/progress").then(function (p) {
      var tiles = [
        [p.items_practised + " / " + p.items_total, "items practised"],
        [p.total_attempts, "recordings made"],
        [p.due_now, "due for review now"],
        [p.mastered, "items mastered"],
      ];
      $("tiles").innerHTML = tiles.map(function (t) { return '<div class="tile"><div class="v">' + t[0] + '</div><div class="l">' + t[1] + "</div></div>"; }).join("");
      drawChart(p.daily);
      $("sound-list").innerHTML = p.sounds.length ? p.sounds.slice(0, 12).map(function (s) {
        var info = SpanishSounds.SOUNDS[s.key] || {};
        return '<div class="bar-row" data-tip="' + esc(info.tip || "") + '"><span>' + esc(s.label) + '</span><div class="bar-track"><div class="bar-fill ' +
          colour(s.avg) + '" style="width:' + Math.max(2, s.avg) + '%"></div></div><span class="val">' + Math.round(s.avg) + "</span></div>";
      }).join("") + '<p class="hint">Weakest first, from your recent recordings. Hover a sound for a tip.</p>'
        : '<div class="empty">Practise a few items and your sounds will appear here.</div>';
      $("weak-list").innerHTML = p.weak_items.length ? p.weak_items.slice(0, 10).map(function (w) {
        return '<div class="list-row"><span>' + esc(w.es) + ' <span class="meta">· ' + esc(w.deck) + '</span></span><span><span class="pill ' + colour(w.last_score) + '">' +
          w.last_score + '</span> <button class="small-btn" data-practise="' + esc(w.id) + '">Practise</button></span></div>';
      }).join("") : '<div class="empty">Nothing yet.</div>';
      bindTooltips($("sound-list"));
    });
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
      if (i % step === 0 || i === daily.length - 1)
        svg += '<text class="axis" x="' + x(i) + '" y="' + (H - 10) + '" text-anchor="middle">' + d.day.slice(5) + "</text>";
    });
    if (daily.length > 1) svg += '<polyline class="series" points="' + daily.map(function (d, i) { return x(i) + "," + y(d.avg); }).join(" ") + '"/>';
    daily.forEach(function (d, i) {
      svg += '<circle class="pt" cx="' + x(i) + '" cy="' + y(d.avg) + '" r="5"/>';
      var hw = daily.length === 1 ? 40 : (W - L - R) / (daily.length - 1) / 2;
      svg += '<rect class="hit" x="' + (x(i) - hw) + '" y="' + T + '" width="' + 2 * hw + '" height="' + (H - T - B) + '" data-tip="' +
        esc(d.day + ": average " + d.avg + " (" + d.count + " items)") + '"/>';
    });
    el.innerHTML = svg + "</svg>";
    bindTooltips(el);
  }
  function bindTooltips(container) {
    var tip = $("tooltip");
    Array.prototype.forEach.call(container.querySelectorAll("[data-tip]"), function (n) {
      if (!n.getAttribute("data-tip")) return;
      n.addEventListener("mousemove", function (e) {
        tip.textContent = n.getAttribute("data-tip"); tip.classList.remove("hidden");
        var x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
        tip.style.left = x + "px"; tip.style.top = (e.clientY + 14) + "px";
      });
      n.addEventListener("mouseleave", function () { tip.classList.add("hidden"); });
    });
  }

  // ------------------------------------------------------------ my words screen
  function loadWordList() {
    loadItems().then(function () {
      var html = "";
      state.decks.forEach(function (d) {
        html += '<div class="deck-title">' + esc(d) + "</div>";
        state.items.filter(function (i) { return i.deck === d; }).forEach(function (i) {
          var sc = i.last_score;
          html += '<div class="list-row"><span>' + esc(i.es) + ' <span class="meta">' + esc(i.en || "") + (i.fr ? " · " + esc(i.fr) : "") + "</span></span><span>" +
            '<span class="pill ' + (sc == null ? "none" : colour(sc)) + '">' + (sc == null ? "new" : sc) + "</span> " +
            '<button class="small-btn" data-practise="' + esc(i.id) + '">Practise</button>' +
            (i.custom ? ' <button class="small-btn" data-delete="' + esc(i.id) + '">Delete</button>' : "") + "</span></div>";
        });
      });
      $("all-items").innerHTML = html;
    });
  }

  // ------------------------------------------------------------ setup check
  function check(id, ok, html) {
    var li = $(id); li.classList.remove("pass", "fail"); li.classList.add(ok ? "pass" : "fail");
    li.querySelector(".mark").textContent = ok ? "✓" : "✗";
    li.querySelector(".chk-body").innerHTML = html;
  }
  function checkSettings() {
    return api("/api/status").then(function (s) {
      if (s.region && !$("region-input").value) $("region-input").value = s.region;
      if (!s.key_ok) check("chk-settings", false, "Paste <b>KEY 1</b> and the <b>Location/Region</b> from your Azure Speech resource (page “Keys and Endpoint”), then press Save.");
      else if (!s.region) check("chk-settings", false, "The key is saved, but the region is missing (for example <code>westeurope</code>).");
      else check("chk-settings", true, "Key saved. Region: <b>" + esc(s.region) + "</b> · Voice: " + esc(s.voice) + " · Speed: " + esc(s.speed) +
        "<br><small>Settings file: <code>" + esc(s.settings_path) + "</code></small>");
      return s;
    });
  }
  $("key-form").addEventListener("submit", function (e) {
    e.preventDefault();
    api("/api/settings", { key: $("key-input").value, region: $("region-input").value }).then(function (res) {
      if (!res.ok) { check("chk-settings", false, esc(res.error)); return; }
      $("key-input").value = ""; state.auth = null;
      checkSettings().then(function (s) { if (s.key_ok && s.region) checkAzure(); });
    });
  });
  function checkAzure() {
    $("chk-azure").querySelector(".chk-body").textContent = "Contacting Azure…";
    return getAuth(true).then(function (auth) {
      return speak("Hola, vamos a practicar.", false).then(function () {
        check("chk-azure", true, "Connected to Azure (" + esc(auth.region) + "). You should hear “Hola, vamos a practicar.”" + (auth.note ? "<br><small>" + esc(auth.note) + "</small>" : ""));
      });
    }).catch(function (e) { check("chk-azure", false, esc(e.message) + (e.help ? "<br>" + esc(e.help) : "")); });
  }
  var meterStream = null;
  function checkMic() {
    if (!navigator.mediaDevices) { check("chk-mic", false, "This browser can't use a microphone here. Please use Chrome, Edge or Safari and open http://localhost:8765"); return; }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      meterStream = stream;
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var an = ctx.createAnalyser(); an.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(an);
      var data = new Uint8Array(an.fftSize), peak = 0, t0 = Date.now();
      $("meter").classList.remove("hidden");
      check("chk-mic", false, "Say something now… the green bar should move.");
      $("chk-mic").querySelector(".mark").textContent = "🎤";
      (function loop() {
        an.getByteTimeDomainData(data);
        var max = 0; for (var i = 0; i < data.length; i++) max = Math.max(max, Math.abs(data[i] - 128));
        var level = Math.min(100, max / 128 * 160);
        peak = Math.max(peak, level);
        $("meter-bar").style.width = level + "%";
        if (Date.now() - t0 < 6000) return requestAnimationFrame(loop);
        stream.getTracks().forEach(function (t) { t.stop() }); ctx.close();
        $("meter").classList.add("hidden");
        if (peak > 12) check("chk-mic", true, "Your microphone works.");
        else check("chk-mic", false, "The microphone is allowed but I heard almost nothing. Check that the right microphone is selected in your computer's sound settings, then test again.");
      })();
    }).catch(function () {
      check("chk-mic", false, "The browser was not allowed to use the microphone. Click the lock/microphone icon in the address bar, choose <b>Allow</b>, then press Test again.");
    });
  }
  function checkPron() {
    var body = $("chk-pron").querySelector(".chk-body");
    body.textContent = "Connecting…";
    assess("Hola, buenos días", function () { body.innerHTML = "🔴 Say: <b>“Hola, buenos días”</b>"; })
      .then(function (res) {
        var a = SpanishSounds.analyse("Hola, buenos días", res.json);
        check("chk-pron", true, "It works! Your score: <b>" + a.overall + "</b> (accuracy " + a.accuracy + ", fluency " + a.fluency + "). Words: " +
          a.words.map(function (w) { return '<span class="pill ' + w.colour + '">' + esc(w.text) + " " + w.score + "</span>"; }).join(" ") +
          "<br>Everything is ready. Go to the <b>Practise</b> tab.");
      }).catch(function (e) { check("chk-pron", false, esc(e.message) + (e.help ? "<br>" + esc(e.help) : "")); });
  }

  // ------------------------------------------------------------ navigation & events
  function showView(name) {
    Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (t) { t.classList.toggle("active", t.dataset.view === name); });
    Array.prototype.forEach.call(document.querySelectorAll(".view"), function (v) { v.classList.toggle("active", v.id === "view-" + name); });
    if (name === "progress") loadProgress();
    if (name === "words") loadWordList();
    if (name === "setup") checkSettings();
  }
  function practiseById(id) {
    var item = state.items.filter(function (i) { return i.id === id; })[0];
    if (!item) return;
    showView("practice"); showItem(item, "extra");
  }

  document.querySelectorAll(".tab").forEach(function (t) { t.addEventListener("click", function () { showView(t.dataset.view); }); });
  $("btn-listen").addEventListener("click", function () { listen(false); });
  $("btn-slow").addEventListener("click", function () { listen(true); });
  $("btn-record").addEventListener("click", record);
  $("btn-me").addEventListener("click", function () { if (state.lastRecordingUrl) playUrl(state.lastRecordingUrl); });
  $("btn-next").addEventListener("click", function () { if (!state.recording) nextItem(); });
  $("deck").addEventListener("change", function (e) {
    state.deck = e.target.value; try { localStorage.setItem("deck", state.deck); } catch (er) {}
    nextItem();
  });
  document.addEventListener("click", function (e) {
    var p = e.target.closest && e.target.closest("[data-practise]");
    if (p) { loadItems().then(function () { practiseById(p.dataset.practise); }); }
    var d = e.target.closest && e.target.closest("[data-delete]");
    if (d && confirm("Delete this item?")) api("/api/items/delete", { id: d.dataset.delete }).then(loadWordList);
  });
  document.addEventListener("keydown", function (e) {
    if (!$("view-practice").classList.contains("active") || e.target.matches("input, select, textarea") || e.metaKey || e.ctrlKey || e.altKey) return;
    var k = e.key.toLowerCase();
    if (k === "l") listen(false); else if (k === "s") listen(true); else if (k === "r") record();
    else if (k === "m") $("btn-me").click(); else if (k === "n") $("btn-next").click();
  });
  $("add-form").addEventListener("submit", function (e) {
    e.preventDefault();
    api("/api/items", { es: $("add-es").value, en: $("add-en").value, fr: $("add-fr").value, deck: $("add-deck").value })
      .then(function (res) {
        if (res.error) { $("add-msg").textContent = res.error; return; }
        $("add-msg").textContent = "Added “" + res.item.es + "” to " + res.item.deck + ".";
        $("add-es").value = $("add-en").value = $("add-fr").value = "";
        loadWordList();
      });
  });
  $("add-listen").addEventListener("click", function () { if ($("add-es").value.trim()) speak($("add-es").value.trim(), false).catch(function () {}); });
  $("run-azure").addEventListener("click", checkAzure);
  $("run-mic").addEventListener("click", checkMic);
  $("run-pron").addEventListener("click", checkPron);

  // ------------------------------------------------------------ start
  loadItems().then(nextItem);
  api("/api/status").then(function (s) {
    if (!s.settings_found || !s.key_ok || !s.region) {
      showView("setup");
    }
  });
})();
