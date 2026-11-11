/* Spanish Course - page logic (runs entirely in the browser) */
(function () {
  "use strict";
  var store = new PracticeStore(window.localStorage, window.BUILTIN_DECKS);
  Speech.init(store);
  SpanishSounds.setAccent(store.settings().accent);

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); };
  var colour = function (s) { return SpanishSounds.colourFor(s); };
  var each = function (sel, fn, root) { Array.prototype.forEach.call((root || document).querySelectorAll(sel), fn); };
  var SOUND_LABELS = {};
  Object.keys(SpanishSounds.SOUNDS).forEach(function (k) { SOUND_LABELS[k] = SpanishSounds.SOUNDS[k].label; });

  var state = {
    course: null, levels: [], units: {}, byKey: {}, courseKeys: [],
    unit: null, session: null, entry: null, why: "",
    recent: [], shown: [], attemptsThisItem: [], recording: null, lastRecording: null,
  };
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
  // Lesson text: paragraphs, line breaks and **bold**.
  function rich(text) {
    return String(text || "").split(/\n\s*\n/).map(function (p) {
      return "<p>" + esc(p.trim()).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>") + "</p>";
    }).join("");
  }
  // Tips written for both accents ("THE-ro (Spain) / SE-ro"): keep the half
  // for the chosen accent.
  function accentTip(tip) {
    tip = String(tip || "");
    var parts = tip.split(" / ");
    if (parts.length !== 2) return tip;
    var single = function (t) { return /^[A-Za-zÁÉÍÓÚÑÜáéíóúñü-]+$/.test(t.trim()); };
    var marked = /\((Spain|España)\)/i.test(parts[0]);
    if (!marked && !(single(parts[0]) && single(parts[1]))) return tip;
    var pick = store.settings().accent === "es-MX" ? parts[1] : parts[0];
    return pick.replace(/\s*\((Spain|España|Latin America|Latinoamérica|Mexico|México)\)\s*/gi, " ").trim();
  }
  // Pronunciation guide: the stressed syllable (in CAPITALS) is shown in bold.
  function tipHtml(tip) {
    return esc(accentTip(tip)).replace(/[A-Za-zÁÉÍÓÚÑÜáéíóúñü]+/g, function (m, off, str) {
      var upper = m === m.toUpperCase() && m !== m.toLowerCase();
      if (!upper) return m;
      if (m.length > 1 || str[off - 1] === "-" || str[off + m.length] === "-") return "<b>" + m + "</b>";
      return m;
    });
  }
  function bar(pct, cls) { return '<span class="pbar"><span class="pfill ' + (cls || "") + '" style="width:' + Math.max(0, Math.min(100, pct)) + '%"></span></span>'; }

  // ------------------------------------------------------------ course
  function buildIndex() {
    var levels = state.course.levels.slice();
    var mine = store.myWordsLevel(levels.length);
    if (mine.units.length) levels.push(mine);
    state.levels = levels;
    state.units = {}; state.byKey = {}; state.courseKeys = [];
    levels.forEach(function (l) {
      l.units.forEach(function (u) {
        state.units[u.id] = u;
        u.items.forEach(function (it) {
          if (!state.byKey[it.key]) { state.byKey[it.key] = { item: it, unit: u, level: l }; state.courseKeys.push(it.key); }
        });
      });
    });
    store.setCourse({ levels: levels });
    $("deck-names").innerHTML = mine.units.map(function (u) { return '<option value="' + esc(u.title) + '">'; }).join("");
  }
  function courseUnits() {
    var out = [];
    state.course.levels.forEach(function (l) { l.units.forEach(function (u) { out.push(u); }); });
    return out;
  }
  function nextUnit() {
    var units = courseUnits();
    for (var i = 0; i < units.length; i++) if (units[i].items.length && !store.unitProgress(units[i]).isLearned) return units[i];
    return null;
  }
  function isSoundsLevel(entry) { return entry && entry.level && entry.level.index === 0 && !entry.level.custom; }

  // ------------------------------------------------------------ home
  function renderHome() {
    var now = Date.now(), s = store.settings();
    var up = nextUnit();
    if (up) {
      var p = store.unitProgress(up), lvl = state.course.levels[up.levelIndex];
      $("next-card").innerHTML = '<div class="eyebrow">Up next</div><div class="next-title">' + esc(up.title) + '</div>' +
        (up.subtitle ? '<div class="u-sub">' + esc(up.subtitle) + "</div>" : "") +
        '<div class="meta">Level ' + lvl.number + " · " + esc(lvl.title) + "</div>" +
        '<div class="next-bar">' + bar(p.pct) + " <span>" + p.pct + "% learned</span></div>" +
        '<button class="big next" data-unit="' + esc(up.id) + '">Start ▶</button>';
    } else {
      $("next-card").innerHTML = '<div class="eyebrow">Up next</div><div class="next-title">🎉 You have learned the whole course!</div><div class="meta">Keep your reviews going so it stays fresh.</div>';
    }
    var due = store.dueKeys(state.courseKeys, now).length, newToday = store.newToday(now);
    $("today-card").innerHTML = '<div class="eyebrow">Today</div>' +
      '<div class="today-row"><span>New items</span><b>' + newToday + " / " + s.newPerDay + "</b></div>" +
      '<div class="today-row"><span>Reviews due</span><b>' + due + "</b></div>" +
      (due ? '<button class="mid primary" data-action="review">🔁 Review now (' + due + ")</button>" : '<div class="meta">No reviews due. 👍</div>') +
      (function () {
        var vs = store.vocabStats(state.courseKeys, vocabMode()), n = vs.due + vs.fresh;
        return '<div class="today-row vocab"><span>Vocabulary due</span><b>' + n + "</b></div>" +
          (n ? '<button class="mid primary" data-go="vocab-start">🧠 Vocabulary test (' + n + ")</button>" : '<div class="meta">' + (vs.pool ? "Vocabulary up to date. 👍" : "Practise a unit to start your vocabulary.") + "</div>");
      })();

    var allSounds = store.weakSounds(SOUND_LABELS);
    var weak = allSounds.filter(function (w) { return w.avg < 85; }).slice(0, 5);
    $("weak-sounds").innerHTML = !allSounds.length ? '<div class="empty">After a few recordings, the sounds you find hardest will appear here.</div>'
      : !weak.length ? '<div class="empty">No weak sounds right now: every sound averages 85 or more. 👏</div>' : weak.map(function (w) {
      var info = SpanishSounds.soundInfo(w.key);
      return '<div class="ws-row"><div class="ws-head"><b>' + esc(w.label) + '</b>' + bar(w.avg, colour(w.avg)) +
        '<span class="val">' + Math.round(w.avg) + '</span><button class="small-btn" data-sound="' + esc(w.key) + '">Practise</button></div>' +
        '<div class="ws-tip">' + esc(info.tip) + (info.fr ? ' <span class="fr-cmp">🇫🇷 ' + esc(info.fr) + "</span>" : "") + "</div></div>";
    }).join("");

    $("levels").innerHTML = state.levels.map(function (l) {
      var learnedUnits = l.units.filter(function (u) { return store.unitProgress(u).isLearned; }).length;
      return '<section class="level"><div class="level-head"><div><div class="eyebrow">' + (l.custom ? "Your own" : "Level " + l.number) + "</div>" +
        "<h2>" + esc(l.title) + "</h2>" + (l.subtitle ? '<div class="meta">' + esc(l.subtitle) + "</div>" : "") + "</div>" +
        '<div class="meta">' + learnedUnits + " / " + l.units.length + " units learned</div></div>" +
        '<div class="unit-grid">' + l.units.map(function (u) {
          var p = store.unitProgress(u, now);
          return '<button class="unit-row' + (p.isLearned ? " learned" : "") + (up && up.id === u.id ? " current" : "") + '" data-unit="' + esc(u.id) + '">' +
            '<span class="u-title">' + (p.isLearned ? "✓ " : "") + esc(u.title) + "</span>" +
            (u.subtitle ? '<span class="u-sub">' + esc(u.subtitle) + "</span>" : "") +
            '<span class="u-bar">' + bar(p.pct, p.isLearned ? "good" : "") + '<span class="u-pct">' + p.pct + "%</span></span>" +
            '<span class="u-meta">' + p.total + (p.total === 1 ? " item" : " items") + (p.due ? ' · <span class="due">' + p.due + " due</span>" : "") + "</span></button>";
        }).join("") + "</div></section>";
    }).join("");
  }

  // ------------------------------------------------------------ unit (lesson)
  function openUnit(id) {
    var u = state.units[id];
    if (!u) return;
    state.unit = u;
    var l = state.levels[u.levelIndex];
    $("unit-level").textContent = (l.custom ? "My words" : "Level " + l.number + " · " + l.title);
    $("unit-title").textContent = u.title;
    $("unit-subtitle").textContent = u.subtitle || "";
    renderUnitProgress();
    $("unit-lesson").innerHTML = u.lesson ? rich(u.lesson) : "";
    $("unit-lesson").classList.toggle("hidden", !u.lesson);
    $("unit-examples").innerHTML = u.examples.map(function (e, i) {
      return '<div class="example"><div class="ex-text"><div class="ex-es">' + esc(e.es) + "</div>" +
        (e.en || e.fr ? '<div class="meta">' + esc(e.en) + (e.en && e.fr ? " · " : "") + esc(e.fr) + "</div>" : "") +
        (e.tip ? '<div class="ex-tip">' + tipHtml(e.tip) + "</div>" : "") + "</div>" +
        '<div class="ex-btns"><button class="mid" data-say="' + i + '">🔊 Listen</button><button class="mid" data-say="' + i + '" data-slow="1">🐢 Slow</button></div></div>';
    }).join("");
    $("unit-examples-panel").classList.toggle("hidden", !u.examples.length);
    $("unit-items-count").textContent = "(" + u.items.length + ")";
    $("unit-items").innerHTML = u.items.map(function (it) {
      var e = store.item(it.key), learned = store.isItemLearned(it.key);
      var pill = !e ? '<span class="pill none">new</span>' : '<span class="pill ' + colour(e.best || 0) + '">best ' + (e.best || 0) + "</span>";
      return '<div class="list-row"><span>' + (learned ? "✓ " : "") + esc(it.es) + ' <span class="meta">' + esc(it.en) + "</span></span>" +
        '<span class="row-end">' + pill + ' <button class="small-btn" data-practise="' + esc(it.key) + '">Practise</button></span></div>';
    }).join("");
    showView("unit");
  }
  function renderUnitProgress() {
    var u = state.unit, p = store.unitProgress(u);
    $("unit-progress").innerHTML = bar(p.pct, p.isLearned ? "good" : "") + " <b>" + p.pct + "% learned</b>" +
      ' <span class="meta">(' + p.learned + " of " + p.total + " items scored 80+ on two different days" + (p.isLearned ? " · ✓ unit learned" : "; 80% needed") + ")</span>";
  }
  function sayExample(i, slow) {
    var e = state.unit && state.unit.examples[i];
    if (!e) return;
    Speech.speak(e.es, slow).catch(function (err) { if (!Speech.speakFallback(e.es, slow)) alert(err.message); });
  }

  // ------------------------------------------------------------ practice sessions
  /*
   * session.type: "unit" (one unit, spaced repetition), "review" (everything
   * due in the course), "list" (a fixed list, e.g. a sound drill).
   */
  function startSession(sess) {
    sess.done = 0; sess.moreNew = false; sess.extraOk = false;
    state.session = sess; state.recent = []; state.shown = [];
    if (sess.type === "unit") sess.returnTo = sess.unit.id;
    $("practice-back").textContent = sess.returnTo ? "← Unit" : "← Home";
    showView("practice");
    nextInSession();
  }
  function sessionLabel() {
    var s = state.session;
    var name = s.type === "unit" ? s.unit.title : s.label;
    return name + " · " + s.done + " done";
  }
  function nextInSession() {
    var s = state.session;
    Speech.stopPlayback();
    $("practice-end").classList.add("hidden");
    $("practice-main").classList.remove("hidden");
    var key = null, why = "";
    if (s.type === "list") {
      key = s.queue.shift(); why = "extra";
      if (!key) return endSession("done");
    } else {
      var r = store.chooseNext(s.keys, { exclude: state.recent, shown: state.shown, moreNew: s.moreNew, extraOk: s.extraOk });
      if (s.type === "review" && r.why !== "review") return endSession("reviews-done");
      if (r.why === "limit") return endSession("limit", r);
      if (r.why === "extra" && !s.extraOk) return endSession("all-done");
      if (!r.key) return endSession("done");
      key = r.key; why = r.why;
    }
    showItem(state.byKey[key], why);
  }
  function endSession(reason, r) {
    var s = state.session, html = "", n = store.settings().newPerDay;
    if (reason === "limit") {
      html = "<h3>That's today's " + n + " new items 👏</h3><p>New items are limited to " + n + " a day so you can remember them. " +
        "Items you found hard will come back for review. There " + (r.freshLeft === 1 ? "is 1 new item" : "are " + r.freshLeft + " new items") + " left in this unit.</p>" +
        '<div class="row"><button class="mid primary" data-end="more">Continue with new items anyway</button>' +
        (s.keys.some(function (k) { return store.item(k); }) ? '<button class="mid" data-end="extra">Extra practice of items I\'ve seen</button>' : "") +
        '<button class="mid" data-end="back">Back</button></div>';
    } else if (reason === "all-done") {
      html = "<h3>All done here for now ✅</h3><p>Nothing in this unit is due for review right now. Items come back after a few minutes (if they were hard) up to several weeks (if they were easy).</p>" +
        '<div class="row"><button class="mid primary" data-end="extra">Keep practising anyway</button><button class="mid" data-end="back">Back</button></div>';
    } else if (reason === "reviews-done") {
      html = "<h3>All reviews done ✅</h3><p>Come back later or tomorrow for the next ones.</p>" +
        '<div class="row"><button class="mid primary" data-end="home">Home</button></div>';
    } else {
      html = "<h3>Finished ✅</h3>" + '<div class="row"><button class="mid primary" data-end="back">Back</button></div>';
    }
    if (s.type === "unit") {
      var p = store.unitProgress(s.unit);
      html += '<p class="meta">This unit: ' + p.pct + "% learned" + (p.isLearned ? " · ✓ learned" : "") + "</p>";
    }
    $("practice-session").textContent = sessionLabel();
    $("practice-end").innerHTML = html;
    $("practice-end").classList.remove("hidden");
    $("practice-main").classList.add("hidden");
  }
  var WHY = { "new": "New", review: "Review", extra: "Extra practice" };
  function showItem(entry, why) {
    var it = entry.item;
    state.entry = entry; state.why = why || ""; state.attemptsThisItem = []; state.lastRecording = null;
    if (state.shown.indexOf(it.key) < 0) state.shown.push(it.key);
    state.recent = state.recent.filter(function (k) { return k !== it.key; }).concat([it.key]).slice(-3);
    $("es").textContent = it.es; $("en").textContent = it.en || "—";
    $("fr").textContent = it.fr || "—"; $("tip").innerHTML = it.tip ? tipHtml(it.tip) : "—";
    reveal(false);
    $("btn-reveal").textContent = it.tip ? "Show tip & French" : "Show French";
    $("why").textContent = (WHY[why] ? WHY[why] + " · " : "") + entry.unit.title;
    $("result").classList.add("hidden");
    $("btn-me").disabled = true;
    $("practice-session").textContent = sessionLabel();
    setStatus("");
    // Play the model first
    if (store.isConfigured()) listen(false, true);
  }
  function reveal(on) {
    each(".reveal", function (el) { el.classList.toggle("hidden", !on); });
    if (on && state.entry && !state.entry.item.tip) $("tip-line").classList.add("hidden");
    $("btn-reveal").classList.toggle("hidden", on);
  }
  function listen(slow, auto) {
    if (!state.entry || state.recording) return;
    var es = state.entry.item.es;
    setStatus(auto ? "🔊 Listen, then tap 🎤 Record and say it." : slow ? "Playing slowly…" : "Playing…");
    Speech.speak(es, slow).then(function () {
      if (/^Playing/.test($("status").textContent)) setStatus("");
    }).catch(function (e) {
      if (Speech.speakFallback(es, slow)) setStatus("Using the iPad's own voice because Azure didn't answer: " + e.message, true);
      else setStatus(e.message + (e.help ? " " + e.help : ""), true);
    });
  }
  function record() {
    if (!state.entry) return;
    if (state.recording) { state.recording.stop(); return; } // second tap = stop
    Speech.stopPlayback();
    var btn = $("btn-record"), entry = state.entry, it = entry.item, level = $("rec-level"), barEl = $("rec-level-bar");
    var unitBefore = store.unitProgress(entry.unit).isLearned, itemBefore = store.isItemLearned(it.key);
    btn.textContent = "⏳ Starting…";
    setStatus("Starting the microphone…");
    var ctl = Speech.assess(it.es, function () {
      btn.classList.add("recording"); btn.textContent = "⏹ Stop";
      level.classList.remove("hidden");
      setStatus("Speak now: “" + it.es + "”. It stops by itself when you finish.");
    }, function (v) { barEl.style.width = Math.round(v * 100) + "%"; });
    state.recording = ctl;
    ctl.promise.then(function (res) {
      if (state.entry !== entry) return;
      var a = SpanishSounds.analyse(it.es, res.json);
      var first = state.attemptsThisItem.length === 0;
      state.attemptsThisItem.push(a.overall);
      if (first) state.session.done++;
      showResult(a, isSoundsLevel(entry));
      reveal(true);
      if (res.recording) { state.lastRecording = res.recording; $("btn-me").disabled = false; }
      var saved = store.recordAttempt({ key: it.key, first: first, overall: a.overall, accuracy: a.accuracy,
        fluency: a.fluency, completeness: a.completeness, sounds: a.sounds });
      var msg = first ? "Tap 🎤 Record to try again, or Next ➡ to move on." : "Try as often as you like.";
      if (saved.learned && !itemBefore) msg = "✓ Learned! (80+ on two different days) " + msg;
      if (!unitBefore && store.unitProgress(entry.unit).isLearned) msg = "🎉 Unit “" + entry.unit.title + "” learned! " + msg;
      setStatus(saved.saved ? msg : "Warning: your result could not be saved (iPad storage full or blocked).", !saved.saved);
      $("practice-session").textContent = sessionLabel();
    }).catch(function (e) {
      if (e.recording && state.entry === entry) { state.lastRecording = e.recording; $("btn-me").disabled = false; }
      setStatus(e.message + (e.help ? " " + e.help : "") +
        (e.recording ? " You can still tap 👂 Hear myself, or 🎤 Record to try again." : ""), true);
    }).then(function () {
      state.recording = null;
      btn.classList.remove("recording"); btn.textContent = "🎤 Record";
      level.classList.add("hidden"); barEl.style.width = "0";
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
  function showResult(a, soundsLevel) {
    var setNum = function (id, v) { var el = $(id); el.textContent = v; el.className = "num " + colour(v); };
    setNum("s-overall", a.overall); setNum("s-accuracy", a.accuracy); setNum("s-fluency", a.fluency); setNum("s-complete", a.completeness);
    var wordsEl = $("words");
    wordsEl.innerHTML = a.words.map(function (w, i) {
      return '<button class="word ' + w.colour + '" data-i="' + i + '">' + markWord(w) + "<small>" + w.score + "</small></button>";
    }).join("");
    var tips = [];
    a.words.forEach(function (w) {
      (w.problems || []).forEach(function (p) {
        if (p.message) { tips.push('<div class="tip"><b class="w">' + esc(w.text) + "</b> — " + esc(p.message) + "</div>"); return; }
        if (soundsLevel) {
          // Level 1: name the exact sound and compare with French
          tips.push('<div class="tip sound-focus"><div class="sf-head">Sound: <b>' + esc(p.label) + '</b> — <span class="snd">' + esc(p.spelling) +
            "</span> in <b>" + esc(w.text) + "</b> <span class=\"meta\">(score " + p.score + ")</span></div>" +
            "<div>" + esc(p.tip) + "</div>" + (p.french ? '<div class="fr-cmp">🇫🇷 ' + esc(p.french) + "</div>" : "") + "</div>");
        } else {
          tips.push('<div class="tip"><b class="w">' + esc(w.text) + '</b> — <span class="snd">' + esc(p.spelling) + "</span> " +
            esc(p.label) + " (" + p.score + "). " + esc(p.tip) + "</div>");
        }
      });
    });
    if (a.inserted.length) tips.push('<div class="tip">Extra words I heard that are not in the sentence: <b>' + esc(a.inserted.join(", ")) + "</b></div>");
    if (!tips.length) tips.push('<div class="tip great">¡Muy bien! Every word sounded good.</div>');
    $("tips").innerHTML = tips.join("");
    var att = state.attemptsThisItem;
    $("attempts").textContent = "Attempts on this item: " + att.length + " · best " + Math.max.apply(null, att) +
      (att.length > 1 ? " · scores " + att.join(" → ") : "") + (a.heard ? " · Azure heard: “" + a.heard + "”" : "");
    $("result").classList.remove("hidden");
    each(".word", function (el) {
      el.addEventListener("click", function () {
        var w = a.words[+el.dataset.i];
        each(".word", function (x) { x.classList.remove("selected"); }, wordsEl);
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
    }, wordsEl);
  }
  /* Practise one sound: items containing it, weakest first (max 10). */
  function soundDrill(soundKey) {
    var withSound = state.courseKeys.filter(function (k) {
      return SpanishSounds.sentenceToSounds(state.byKey[k].item.es).some(function (w) {
        return w.units.some(function (u) { return u.key === soundKey; });
      });
    });
    withSound.sort(function (a, b) {
      var ea = store.item(a), eb = store.item(b);
      return (ea ? ea.last_score : 101) - (eb ? eb.last_score : 101) || state.byKey[a].item.es.length - state.byKey[b].item.es.length;
    });
    startSession({ type: "list", queue: withSound.slice(0, 10), label: "Sound: " + SOUND_LABELS[soundKey] });
  }

  // ------------------------------------------------------------ progress screen
  function loadProgress() {
    var p = store.progress(SOUND_LABELS, state.courseKeys, Date.now());
    var tiles = [[p.items_learned + " / " + p.items_total, "items learned"], [p.items_practised, "items practised"],
                 [p.total_attempts, "recordings made"], [p.due_now, "due for review now"]];
    $("tiles").innerHTML = tiles.map(function (t) { return '<div class="tile"><div class="v">' + t[0] + '</div><div class="l">' + t[1] + "</div></div>"; }).join("");
    drawChart(p.daily);
    $("sound-list").innerHTML = p.sounds.length ? p.sounds.slice(0, 12).map(function (s) {
      var info = SpanishSounds.soundInfo(s.key);
      return '<details class="bar-detail"><summary class="bar-row"><span>' + esc(s.label) + '</span><span class="bar-track"><span class="bar-fill ' +
        colour(s.avg) + '" style="width:' + Math.max(2, s.avg) + '%"></span></span><span class="val">' + Math.round(s.avg) + "</span></summary>" +
        '<div class="bar-tip">' + esc(info.tip) + (info.fr ? "<br>🇫🇷 " + esc(info.fr) : "") + "</div></details>";
    }).join("") + '<p class="hint">Weakest first, from your recent recordings. Tap a sound for a tip.</p>'
      : '<div class="empty">Practise a few items and your sounds will appear here.</div>';
    $("weak-list").innerHTML = p.weak_items.length ? p.weak_items.slice(0, 10).map(function (w) {
      return '<div class="list-row"><span>' + esc(w.es) + ' <span class="meta">· ' + esc(w.unit) + '</span></span><span class="row-end"><span class="pill ' +
        colour(w.last_score) + '">' + w.last_score + '</span> <button class="small-btn" data-practise="' + esc(w.key) + '">Practise</button></span></div>';
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
    each(".hit", function (n) {
      var show = function () { $("chart-readout").textContent = n.getAttribute("data-tip"); };
      n.addEventListener("click", show); n.addEventListener("mouseenter", show);
    }, el);
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

  // ------------------------------------------------------------ my words
  function loadWordList() {
    var mine = store.data.myItems;
    $("all-items").innerHTML = mine.length ? mine.map(function (i) {
      var e = store.item(Store_key(i.es));
      return '<div class="list-row"><span>' + esc(i.es) + ' <span class="meta">' + esc(i.en || "") + (i.fr ? " · " + esc(i.fr) : "") + " · " + esc(i.deck) + "</span></span>" +
        '<span class="row-end"><span class="pill ' + (e ? colour(e.best || 0) : "none") + '">' + (e ? "best " + (e.best || 0) : "new") + "</span> " +
        '<button class="small-btn" data-practise="' + esc(Store_key(i.es)) + '">Practise</button> <button class="small-btn" data-delete="' + esc(i.id) + '">Delete</button></span></div>';
    }).join("") : '<div class="empty">No words of your own yet.</div>';
  }
  function Store_key(es) { return PracticeStore.itemKey(es); }

  // ------------------------------------------------------------ settings & setup
  function fillVoices() {
    var acc = $("accent-input").value, cur = store.settings().voice;
    $("voice-input").innerHTML = Speech.VOICES[acc].map(function (v) { return '<option value="' + v[0] + '">' + esc(v[1]) + "</option>"; }).join("");
    $("voice-input").value = Speech.VOICES[acc].some(function (v) { return v[0] === cur; }) ? cur : Speech.VOICES[acc][0][0];
  }
  function renderSettings() {
    var s = store.settings();
    $("accent-input").value = s.accent; fillVoices();
    $("speed-input").value = s.speed; $("newperday-input").value = s.newPerDay;
    var c = state.course, r = c.report, info;
    if (c.source === Course.FILE) {
      info = "Course file: <b>" + esc(Course.FILE) + "</b> — " + r.levels + " levels, " + r.units + " units, " + r.items + " practice items, " + r.examples + " example phrases.";
    } else {
      info = "<b>" + esc(Course.FILE) + " could not be loaded</b> (" + esc(c.problem) + "), so the built-in word decks are shown instead.";
    }
    if (r.skipped.length) info += "<br>Skipped " + r.skipped.length + " item(s) without Spanish text, e.g. " + esc(r.skipped[0]) + ".";
    if (r.duplicates) info += "<br>" + r.duplicates + " repeated item(s) inside a unit were shown once.";
    info += ' <button class="small-btn" id="reload-course">↻ Reload course</button>';
    $("course-info").innerHTML = info;
    checkSettings();
  }
  function check(id, ok, html, mark) {
    var li = $(id); li.classList.remove("pass", "fail");
    if (ok !== null) li.classList.add(ok ? "pass" : "fail");
    li.querySelector(".mark").textContent = mark || (ok ? "✓" : ok === false ? "✗" : "…");
    li.querySelector(".chk-body").innerHTML = html;
  }
  function checkSettings() {
    var s = store.settings();
    $("region-input").value = s.region || "";
    if (!PracticeStore.keyLooksValid(s.key)) check("chk-settings", false, "Paste <b>KEY 1</b> and the <b>Location/Region</b> from your Azure Speech resource (page “Keys and Endpoint”), then tap Save.");
    else if (!s.region) check("chk-settings", false, "The key is saved, but the region is missing (for example <code>westeurope</code>).");
    else check("chk-settings", true, "Key saved on this iPad (ending in …" + esc(s.key.slice(-4)) + "). Region: <b>" + esc(s.region) + "</b>. To change it, paste a new key below.");
    var home = isStandalone();
    check("chk-home", home, home ? "Opened from the Home Screen. Your results are kept safely."
      : "In Safari, tap the <b>Share</b> button (square with an arrow) → <b>Add to Home Screen</b> → <b>Add</b>. Then always open the program from that icon: this keeps your results safe (Safari can delete data from websites you haven't visited for a while).");
  }
  function checkAzure() {
    check("chk-azure", null, "Contacting Azure…");
    var timeout = new Promise(function (_, reject) {
      setTimeout(function () {
        var e = new Error("Azure did not answer within 20 seconds.");
        e.help = "Check the Wi-Fi, then close the app completely (swipe it away) and open it again.";
        reject(e);
      }, 20000);
    });
    Promise.race([Speech.speak("Hola, vamos a practicar.", false), timeout]).then(function () {
      check("chk-azure", true, "Connected to Azure. You should have heard “Hola, vamos a practicar.” If you heard nothing: turn up the volume, and open Control Center (swipe down from the top-right corner) — if the bell (Silent Mode) is on, tap it off, then test again.");
    }).catch(function (e) { check("chk-azure", false, esc(e.message) + (e.help ? "<br>" + esc(e.help) : "")); });
  }
  function checkMic() {
    Speech.audio();
    if (!navigator.mediaDevices) { check("chk-mic", false, "This browser can't use the microphone here. Please use Safari."); return; }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      var ctx = Speech.audio(), an = ctx.createAnalyser(); an.fftSize = 512;
      var src = ctx.createMediaStreamSource(stream); src.connect(an);
      var data = new Uint8Array(an.fftSize), peak = 0, t0 = Date.now();
      $("meter").classList.remove("hidden");
      check("chk-mic", null, "Say something now… the green bar should move.", "🎤");
      (function loop() {
        an.getByteTimeDomainData(data);
        var max = 0; for (var i = 0; i < data.length; i++) max = Math.max(max, Math.abs(data[i] - 128));
        var lvl = Math.min(100, max / 128 * 160); peak = Math.max(peak, lvl);
        $("meter-bar").style.width = lvl + "%";
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
    var ctl = Speech.assess("Hola, buenos días", function () { check("chk-pron", null, "🔴 Say: <b>“Hola, buenos días”</b>", "🎤"); });
    state.recording = ctl;
    ctl.promise.then(function (res) {
      var a = SpanishSounds.analyse("Hola, buenos días", res.json);
      check("chk-pron", true, "It works! Your score: <b>" + a.overall + "</b> (accuracy " + a.accuracy + ", fluency " + a.fluency + "). " +
        a.words.map(function (w) { return '<span class="pill ' + w.colour + '">' + esc(w.text) + " " + w.score + "</span>"; }).join(" ") +
        "<br>Everything is ready. Go to <b>Home</b>.");
    }).catch(function (e) { check("chk-pron", false, esc(e.message) + (e.help ? "<br>" + esc(e.help) : "")); })
      .then(function () { state.recording = null; });
  }

  // ------------------------------------------------------------ vocabulary (spoken test)
  var EN_VOICE = { lang: "en-US", voice: "en-US-JennyNeural" };
  function vocabMode() { return store.settings().vocabMode || "mixed"; }
  function renderVocab() {
    var st = store.vocabStats(state.courseKeys, vocabMode());
    $("vocab-mode").value = vocabMode();
    var tiles = [[st.pool, "words in your vocabulary"], [st.due, "due now"], [st.fresh, "not tested yet"],
                 [st.knownEsEn, "known Spanish → English"], [st.knownEnEs, "known English → Spanish"],
                 [st.weekAccuracy == null ? "–" : st.weekAccuracy + "%", "right in the last 7 days"]];
    $("vocab-tiles").innerHTML = tiles.map(function (t) { return '<div class="tile"><div class="v">' + t[0] + '</div><div class="l">' + t[1] + "</div></div>"; }).join("");
    var empty = !st.pool;
    $("vocab-empty").innerHTML = "Practise some items in the course first (Home → a unit → Practice). Every word you practise becomes a vocabulary card.";
    $("vocab-empty").classList.toggle("hidden", !empty);
    $("btn-start-quiz").classList.toggle("hidden", empty);
    $("btn-start-quiz").textContent = st.due + st.fresh ? "🧠 Start vocabulary test (" + (st.due + st.fresh) + ")" : "🧠 Extra vocabulary practice";
    var v = store.data.vocab, weak = Object.keys(v).filter(function (id) { return v[id].wrong > 0 && state.byKey[id.split("|")[1]]; })
      .sort(function (a, b) { return (v[b].wrong - v[b].right) - (v[a].wrong - v[a].right) || v[a].level - v[b].level; }).slice(0, 8);
    $("vocab-weak").innerHTML = weak.length ? weak.map(function (id) {
      var dir = id.split("|")[0], it = state.byKey[id.split("|")[1]].item;
      return '<div class="list-row"><span><b>' + esc(it.es) + '</b> <span class="meta">' + esc(it.en) + " · " + (dir === "es-en" ? "Spanish → English" : "English → Spanish") +
        '</span></span><span class="row-end"><span class="pill bad">' + v[id].wrong + " wrong</span> <span class=\"pill good\">" + v[id].right + " right</span></span></div>";
    }).join("") : '<div class="empty">No difficult words yet.</div>';
  }
  function startQuiz() {
    state.quiz = { mode: vocabMode(), count: 0, right: 0, limit: 20, recent: [], extra: false, retry: [] };
    showView("quiz");
    nextCard();
  }
  function nextCard() {
    var q = state.quiz;
    Speech.stopPlayback();
    $("quiz-end").classList.add("hidden"); $("quiz-main").classList.remove("hidden");
    var r = store.chooseVocab(state.courseKeys, q.mode, { exclude: q.recent });
    if (!r.card && q.extra) {
      // extra practice: the cards seen longest ago
      var cards = store.vocabCards(state.courseKeys, q.mode).filter(function (c) { return q.recent.indexOf(c.dir + "|" + c.key) < 0; });
      cards.sort(function (a, b) { return (store.vocabCard(a.key, a.dir) || { due: 0 }).due - (store.vocabCard(b.key, b.dir) || { due: 0 }).due; });
      if (cards.length) r = { card: cards[0], why: "extra" };
    }
    // Words missed in this test come back before it ends.
    if ((!r.card || q.count >= q.limit) && q.retry.length) {
      var again = q.retry[0].split("|");
      r = { card: { dir: again[0], key: again[1] }, why: "again" };
    }
    if (!r.card || (q.count >= q.limit && r.why !== "again")) return endQuiz(!r.card);
    var c = r.card, entry = state.byKey[c.key], it = entry.item;
    q.card = c; q.entry = entry; q.answered = false; q.why = r.why;
    q.recent = q.recent.filter(function (x) { return x !== c.dir + "|" + c.key; }).concat([c.dir + "|" + c.key]).slice(-4);
    $("quiz-why").textContent = ({ review: "Review", "new": "New word", extra: "Extra practice", again: "Once more (you missed it)" })[r.why] + " · " + (c.dir === "es-en" ? "Spanish → English" : "English → Spanish");
    $("quiz-session").textContent = (q.count + 1) + " / " + q.limit + " · " + q.right + " right";
    $("quiz-result").classList.add("hidden");
    $("quiz-answer").disabled = false; $("quiz-dunno").disabled = false;
    if (c.dir === "es-en") {
      $("quiz-prompt").textContent = "🎧 Listen. What does it mean? Say it in English.";
      $("quiz-text").textContent = it.es; $("quiz-text").classList.add("hidden");
      $("quiz-show").classList.remove("hidden");
    } else {
      $("quiz-prompt").textContent = "🗣️ Say it in Spanish:";
      $("quiz-text").textContent = it.en; $("quiz-text").classList.remove("hidden");
      $("quiz-show").classList.add("hidden");
    }
    quizStatus("");
    playPrompt();
  }
  function playPrompt() {
    var q = state.quiz, it = q.entry.item;
    var p = q.card.dir === "es-en" ? Speech.speak(it.es, false) : Speech.speak(it.en, false, EN_VOICE);
    p.catch(function (e) {
      if (q.card.dir === "es-en") { $("quiz-text").classList.remove("hidden"); quizStatus("Could not play the Spanish (" + e.message + "), so it is shown instead.", true); }
    });
  }
  function quizStatus(msg, err) { var el = $("quiz-status"); el.textContent = msg || ""; el.className = "status" + (err ? " error" : ""); }
  function quizAnswer() {
    var q = state.quiz;
    if (!q || q.answered) return;
    if (state.recording) { state.recording.stop(); return; }
    Speech.stopPlayback();
    var c = q.card, it = q.entry.item, btn = $("quiz-answer"), lvl = $("quiz-level"), bar = $("quiz-level-bar");
    var es2en = c.dir === "es-en";
    btn.textContent = "⏳ Starting…"; quizStatus("Starting the microphone…");
    var ctl = Speech.assess(es2en ? it.en : it.es, function () {
      btn.classList.add("recording"); btn.textContent = "⏹ Stop"; lvl.classList.remove("hidden");
      quizStatus(es2en ? "Speak now, in English." : "Speak now, in Spanish.");
    }, function (v) { bar.style.width = Math.round(v * 100) + "%"; }, es2en ? { language: "en-US", noScoring: true } : {});
    state.recording = ctl;
    ctl.promise.then(function (res) {
      if (state.quiz !== q || q.card !== c) return;
      var best = (res.json.NBest && res.json.NBest[0]) || {};
      var heard = res.json.DisplayText || best.Display || "";
      var check = es2en ? Vocab.checkEnglish(it.en, heard) : Vocab.checkSpanish(it.es, heard);
      var pron = es2en ? null : SpanishSounds.analyse(it.es, res.json);
      grade(check.ok, heard, check.note || "", pron);
    }).catch(function (e) {
      quizStatus(e.message + (e.help ? " " + e.help : "") + " Tap 🎤 Answer to try again.", true);
    }).then(function () {
      state.recording = null;
      btn.classList.remove("recording"); btn.textContent = "🎤 Answer";
      lvl.classList.add("hidden"); bar.style.width = "0";
    });
  }
  function grade(ok, heard, note, pron) {
    var q = state.quiz, c = q.card, it = q.entry.item;
    q.answered = true; q.count++; if (ok) q.right++;
    q.before = store.vocabCard(c.key, c.dir) ? JSON.parse(JSON.stringify(store.vocabCard(c.key, c.dir))) : null;
    var saved = store.recordVocab(c.key, c.dir, ok);
    var cid = c.dir + "|" + c.key;
    q.retry = q.retry.filter(function (x) { return x !== cid; });
    if (!ok) q.retry.push(cid);
    $("quiz-answer").disabled = true; $("quiz-dunno").disabled = true;
    $("quiz-text").classList.remove("hidden"); $("quiz-show").classList.add("hidden");
    var html = '<div class="verdict ' + (ok ? "good" : "bad") + '">' + (ok ? "✓ Right!" : heard == null ? "The answer is:" : "✗ Not quite") + "</div>";
    if (heard != null) html += '<div class="heard">You said: <b>“' + esc(heard || "…") + '”</b></div>';
    if (note) html += '<div class="tip">' + esc(note) + "</div>";
    html += '<div class="answer-es">' + esc(it.es) + '</div><div class="answer-tr"><span class="flag">EN</span> ' + esc(it.en) +
      (it.fr ? ' &nbsp; <span class="flag">FR</span> ' + esc(it.fr) : "") + "</div>";
    if (pron) html += '<div class="heard">Pronunciation: <b class="num ' + colour(pron.overall) + '">' + pron.overall + "</b> " +
      pron.words.map(function (w) { return '<span class="pill ' + w.colour + '">' + esc(w.text) + " " + w.score + "</span>"; }).join(" ") + "</div>";
    var nextGap = ok ? (saved.card.level <= 1 ? "in about 10 minutes" : "in " + Math.round(Store_gapDays(saved.card)) + " day(s)") : "in about a minute";
    html += '<div class="meta">This word comes back ' + nextGap + ".</div>";
    html += '<div class="quiz-actions"><button class="big next" id="quiz-next">Next ➡</button>' +
      (!ok && heard ? '<button class="mid" id="quiz-override">I was right (it misheard me)</button>' : "") +
      '<button class="mid" id="quiz-replay">🔊 Hear the Spanish</button></div>';
    $("quiz-result").innerHTML = html;
    $("quiz-result").classList.remove("hidden");
    $("quiz-session").textContent = q.count + " / " + q.limit + " · " + q.right + " right";
    quizStatus(saved.saved ? "" : "Warning: your answer could not be saved (iPad storage full or blocked).", !saved.saved);
    Speech.speak(it.es, false).catch(function () {});
  }
  function Store_gapDays(card) { return Math.max(1, (card.due - card.last) / 86400000); }
  function endQuiz(nothingLeft) {
    var q = state.quiz;
    var html = "<h3>" + (nothingLeft ? "All vocabulary done for now ✅" : "Test finished ✅") + "</h3>" +
      "<p><b>" + q.right + " of " + q.count + "</b> right.</p>" +
      (nothingLeft ? "<p>Nothing else is due. Words come back on their own schedule; practise more course items to add new words.</p>" : "") +
      '<div class="row"><button class="mid primary" id="quiz-more">' + (nothingLeft ? "Extra practice anyway" : "20 more") + '</button><button class="mid" data-go="home">Home</button></div>';
    $("quiz-end").innerHTML = html;
    $("quiz-end").classList.remove("hidden"); $("quiz-main").classList.add("hidden");
  }

  // ------------------------------------------------------------ navigation & events
  function showView(name) {
    if (state.recording && name !== "practice") { state.recording.stop(); }
    each(".tab", function (t) {
      var tabFor = { unit: "home", practice: "home", quiz: "vocab" }[name] || name;
      t.classList.toggle("active", t.dataset.view === tabFor);
    });
    each(".view", function (v) { v.classList.toggle("active", v.id === "view-" + name); });
    if (name === "home") renderHome();
    if (name === "vocab") renderVocab();
    if (name === "progress") loadProgress();
    if (name === "words") loadWordList();
    if (name === "setup") renderSettings();
    if (name === "unit" && state.unit) renderUnitProgress();
    window.scrollTo(0, 0);
  }
  function practiseKey(key) {
    if (!state.byKey[key]) return;
    var fromUnit = $("view-unit").classList.contains("active") && state.unit ? state.unit.id : null;
    startSession({ type: "list", queue: [key], label: state.byKey[key].item.es, returnTo: fromUnit });
  }

  each(".tab", function (t) { t.addEventListener("click", function () { if (state.course) showView(t.dataset.view); }); });
  $("btn-listen").addEventListener("click", function () { listen(false); });
  $("btn-slow").addEventListener("click", function () { listen(true); });
  $("btn-record").addEventListener("click", record);
  $("btn-me").addEventListener("click", function () {
    if (state.lastRecording && !state.recording) Speech.playAudioData(state.lastRecording, "audio/wav").catch(function (e) { setStatus(e.message, true); });
  });
  $("btn-next").addEventListener("click", function () { if (!state.recording) nextInSession(); });
  $("btn-reveal").addEventListener("click", function () { reveal(true); });
  $("btn-start-quiz").addEventListener("click", function () { Speech.audio(); startQuiz(); });
  $("vocab-mode").addEventListener("change", function (e) { store.data.settings.vocabMode = e.target.value; store.save(); renderVocab(); });
  $("quiz-hear").addEventListener("click", function () { if (!state.recording) playPrompt(); });
  $("quiz-answer").addEventListener("click", quizAnswer);
  $("quiz-dunno").addEventListener("click", function () { var q = state.quiz; if (q && !q.answered && !state.recording) grade(false, null, "", null); });
  $("quiz-show").addEventListener("click", function () { $("quiz-text").classList.remove("hidden"); $("quiz-show").classList.add("hidden"); });
  $("btn-start-practice").addEventListener("click", function () {
    var u = state.unit;
    startSession({ type: "unit", unit: u, keys: u.items.map(function (i) { return i.key; }) });
  });
  $("practice-back").addEventListener("click", function () {
    Speech.stopPlayback();
    if (state.session && state.session.returnTo) openUnit(state.session.returnTo); else showView("home");
  });
  document.addEventListener("click", function (e) {
    var t = e.target.closest ? e.target : null;
    if (!t) return;
    var el;
    if ((el = t.closest("[data-unit]"))) { Speech.audio(); openUnit(el.dataset.unit); return; }
    if ((el = t.closest("[data-go]"))) {
      if (state.recording) state.recording.stop();
      Speech.stopPlayback();
      if (el.dataset.go === "vocab-start") { Speech.audio(); startQuiz(); } else showView(el.dataset.go);
      return;
    }
    if (t.id === "quiz-next") { nextCard(); return; }
    if (t.id === "quiz-replay") { Speech.speak(state.quiz.entry.item.es, false).catch(function () {}); return; }
    if (t.id === "quiz-more") { state.quiz.count = 0; state.quiz.right = 0; state.quiz.extra = true; nextCard(); return; }
    if (t.id === "quiz-override") {
      var q = state.quiz;
      store.correctLastVocab(q.card.key, q.card.dir, q.before);
      q.retry = q.retry.filter(function (x) { return x !== q.card.dir + "|" + q.card.key; });
      q.right++;
      $("quiz-session").textContent = q.count + " / " + q.limit + " · " + q.right + " right";
      el = t.closest(".result").querySelector(".verdict"); el.textContent = "✓ Counted as right"; el.className = "verdict good";
      t.remove();
      return;
    }
    if ((el = t.closest("[data-say]"))) { sayExample(+el.dataset.say, !!el.dataset.slow); return; }
    if ((el = t.closest("[data-sound]"))) { soundDrill(el.dataset.sound); return; }
    if ((el = t.closest("[data-action=review]"))) { startSession({ type: "review", keys: state.courseKeys.slice(), label: "Review" }); return; }
    if ((el = t.closest("[data-practise]"))) { practiseKey(el.dataset.practise); return; }
    if ((el = t.closest("[data-delete]"))) {
      if (confirm("Delete this item?")) { store.deleteItem(el.dataset.delete); buildIndex(); loadWordList(); }
      return;
    }
    if ((el = t.closest("[data-end]"))) {
      var act = el.dataset.end, s = state.session;
      if (act === "more") { s.moreNew = true; nextInSession(); }
      else if (act === "extra") { s.extraOk = true; nextInSession(); }
      else if (act === "home" || !s.returnTo) showView("home");
      else openUnit(s.returnTo);
      return;
    }
    if (t.id === "reload-course") { loadCourse().then(function () { renderSettings(); $("course-msg").textContent = "Course reloaded."; }); }
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
    buildIndex(); loadWordList();
  });
  $("add-listen").addEventListener("click", function () {
    var t = $("add-es").value.trim();
    if (t) Speech.speak(t, false).catch(function (er) { $("add-msg").textContent = er.message; });
  });
  $("accent-input").addEventListener("change", fillVoices);
  $("course-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var before = store.settings().accent + store.settings().voice;
    var err = store.saveSettings({ accent: $("accent-input").value, voice: $("voice-input").value,
      speed: $("speed-input").value, newPerDay: $("newperday-input").value });
    if (err) { $("course-msg").textContent = err; $("course-msg").className = "status error"; return; }
    SpanishSounds.setAccent(store.settings().accent);
    if (before !== store.settings().accent + store.settings().voice) Speech.clearCache();
    $("course-msg").className = "status";
    $("course-msg").textContent = "Saved. Accent: " + (store.settings().accent === "es-MX" ? "Mexico" : "Spain") + ", " + store.settings().newPerDay + " new items per day.";
  });
  $("key-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var patch = { region: $("region-input").value };
    var key = $("key-input").value.trim();
    if (key) patch.key = key;
    else if (!store.settings().key) { check("chk-settings", false, "Please paste KEY 1 first."); return; }
    var err = store.saveSettings(patch);
    if (err) { check("chk-settings", false, esc(err)); return; }
    $("key-input").value = ""; Speech.clearCache();
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
      buildIndex(); loadProgress();
    };
    r.readAsText(f); e.target.value = "";
  });
  $("home-hint-close").addEventListener("click", function () { $("home-hint").classList.add("hidden"); });

  // ------------------------------------------------------------ start
  function loadCourse() {
    return Course.load(window.BUILTIN_DECKS).then(function (c) {
      state.course = c;
      buildIndex();
      var prob = $("course-problem");
      if (c.source !== Course.FILE) {
        prob.innerHTML = "⚠️ The course file (" + esc(Course.FILE) + ") could not be loaded: " + esc(c.problem) + ". Showing the old word decks instead.";
        prob.classList.remove("hidden");
      } else prob.classList.add("hidden");
    });
  }
  $("levels").innerHTML = '<div class="empty">Loading the course…</div>';
  loadCourse().then(function () {
    if (isTouchApple() && !isStandalone()) $("home-hint").classList.remove("hidden");
    showView(store.isConfigured() ? "home" : "setup");
  });
})();
