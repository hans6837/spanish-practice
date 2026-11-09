/*
 * Storage for Spanish Pronunciation Practice.
 * Everything (your Azure key, your results, your own words) is kept only in
 * this browser on this device (localStorage). Nothing is sent to GitHub.
 */
(function (root) {
  "use strict";

  var STORAGE_KEY = "spanishPractice.v1";
  var MINUTE = 60 * 1000, DAY = 24 * 60 * MINUTE;
  // Review gaps by level. Level 0 = "needs work": back after a few other items.
  var INTERVALS = [3 * MINUTE, 1 * DAY, 3 * DAY, 7 * DAY, 14 * DAY, 30 * DAY];
  var MAX_ATTEMPTS = 20000;

  function emptyData() {
    return { version: 1, settings: { key: "", region: "", voice: "es-ES-ElviraNeural", speed: "-15%" },
             myItems: [], review: {}, attempts: [] };
  }

  function Store(storage, builtin) {
    this.storage = storage;
    this.builtin = builtin || { decks: [], items: [] };
    this.data = this.load();
  }

  Store.prototype.load = function () {
    var d = emptyData();
    try {
      var raw = this.storage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        Object.keys(d).forEach(function (k) { if (parsed[k] !== undefined) d[k] = parsed[k]; });
        d.settings = Object.assign(emptyData().settings, parsed.settings || {});
      }
    } catch (e) { /* storage blocked or corrupt: start fresh */ }
    return d;
  };

  Store.prototype.save = function () {
    if (this.data.attempts.length > MAX_ATTEMPTS) this.data.attempts = this.data.attempts.slice(-MAX_ATTEMPTS);
    try { this.storage.setItem(STORAGE_KEY, JSON.stringify(this.data)); return true; }
    catch (e) { return false; }
  };

  // ------------------------------------------------------------ settings
  Store.keyLooksValid = function (key) {
    key = String(key || "").trim();
    return key.length >= 32 && /^[A-Za-z0-9]+$/.test(key);
  };
  Store.cleanRegion = function (region) {
    return String(region || "").trim().toLowerCase().replace(/\s+/g, "");
  };
  Store.prototype.settings = function () { return this.data.settings; };
  Store.prototype.saveSettings = function (patch) {
    var s = this.data.settings;
    if (patch.key !== undefined) {
      if (!Store.keyLooksValid(patch.key)) return "That doesn't look like an Azure key. It should be a long code of letters and numbers (KEY 1 on the 'Keys and Endpoint' page).";
      s.key = patch.key.trim();
    }
    if (patch.region !== undefined) {
      var r = Store.cleanRegion(patch.region);
      if (!/^[a-z0-9-]+$/.test(r)) return "Please enter the region, for example westeurope.";
      s.region = r;
    }
    if (patch.voice) s.voice = patch.voice;
    if (patch.speed) s.speed = patch.speed;
    this.save();
    return null;
  };
  Store.prototype.isConfigured = function () {
    var s = this.data.settings;
    return Store.keyLooksValid(s.key) && !!s.region;
  };

  // ------------------------------------------------------------ items
  Store.prototype.decks = function () {
    var decks = this.builtin.decks.slice();
    this.data.myItems.forEach(function (it) { if (decks.indexOf(it.deck) < 0) decks.push(it.deck); });
    return decks;
  };
  Store.prototype.items = function () {
    var review = this.data.review;
    return this.builtin.items.concat(this.data.myItems.map(function (it) { return Object.assign({ custom: true }, it); }))
      .map(function (it) { var r = review[it.id]; return Object.assign({}, it, { last_score: r ? r.last_score : null }); });
  };
  Store.prototype.addItem = function (es, en, fr, deck) {
    es = String(es || "").trim();
    if (!es) return { error: "Please type the Spanish text." };
    var item = { id: "my-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                 deck: String(deck || "").trim() || "My words", es: es,
                 en: String(en || "").trim(), fr: String(fr || "").trim() };
    this.data.myItems.push(item);
    this.save();
    return { item: item };
  };
  Store.prototype.deleteItem = function (id) {
    this.data.myItems = this.data.myItems.filter(function (it) { return it.id !== id; });
    delete this.data.review[id];
    this.save();
  };

  // ------------------------------------------------------------ review scheduling
  Store.prototype.updateReview = function (itemId, score, now) {
    var e = this.data.review[itemId] || { level: 0, seen: 0 };
    var level = e.level || 0;
    if (score >= 85) level = Math.min(level + 1, INTERVALS.length - 1);
    else if (score >= 65) level = level > 1 ? Math.max(1, level - 1) : 1;
    else level = 0;
    e.level = level; e.seen = (e.seen || 0) + 1; e.last = now; e.last_score = Math.round(score);
    e.due = now + INTERVALS[level];
    this.data.review[itemId] = e;
    return e;
  };

  /* Pick what to practise next: due reviews first (weakest first),
     then new items not yet shown this session, then the soonest-due. */
  Store.prototype.chooseNext = function (deck, exclude, shown, now) {
    var review = this.data.review;
    exclude = exclude || []; shown = shown || [];
    now = now || Date.now();
    var pool = this.items().filter(function (it) { return !deck || deck === "All" || it.deck === deck; });
    var cands = pool.filter(function (it) { return exclude.indexOf(it.id) < 0; });
    if (!cands.length) cands = pool;
    if (!cands.length) return { item: null, why: "empty" };
    var due = cands.filter(function (it) { return review[it.id] && review[it.id].due <= now; });
    if (due.length) {
      due.sort(function (a, b) { return (review[a.id].level - review[b.id].level) || (review[a.id].due - review[b.id].due); });
      return { item: due[0], why: "review" };
    }
    var fresh = cands.filter(function (it) { return !review[it.id]; });
    var unshown = fresh.filter(function (it) { return shown.indexOf(it.id) < 0; });
    if (unshown.length) return { item: unshown[0], why: "new" };
    if (fresh.length) return { item: fresh[0], why: "new" };
    cands.sort(function (a, b) { return review[a.id].due - review[b.id].due; });
    return { item: cands[0], why: "extra" };
  };

  // ------------------------------------------------------------ attempts
  Store.prototype.recordAttempt = function (a, now) {
    now = now || Date.now();
    var rec = { t: now, id: a.item_id, f: a.first ? 1 : 0, o: Math.round(a.overall), a: Math.round(a.accuracy),
                fl: Math.round(a.fluency), c: Math.round(a.completeness),
                s: (a.sounds || []).map(function (s) { return [s.key, Math.round(s.score)]; }) };
    this.data.attempts.push(rec);
    var review = null;
    if (a.first && a.item_id) review = this.updateReview(a.item_id, a.overall, now);
    var ok = this.save();
    return { review: review, saved: ok };
  };

  function dayKey(t) {
    var d = new Date(t);
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }

  Store.prototype.progress = function (soundLabels, now) {
    now = now || Date.now();
    var attempts = this.data.attempts, review = this.data.review;
    var items = this.items(), byId = {};
    items.forEach(function (it) { byId[it.id] = it; });

    var days = {};
    attempts.forEach(function (a) {
      if (!a.f) return;
      var k = dayKey(a.t), d = days[k] || (days[k] = { day: k, sum: 0, n: 0 });
      d.sum += a.o; d.n += 1;
    });
    var daily = Object.keys(days).sort().map(function (k) {
      return { day: k, avg: Math.round(days[k].sum / days[k].n * 10) / 10, count: days[k].n };
    }).slice(-60);

    var sounds = {};
    attempts.slice(-600).forEach(function (a) {
      (a.s || []).forEach(function (s) {
        var e = sounds[s[0]] || (sounds[s[0]] = { key: s[0], sum: 0, n: 0 });
        e.sum += s[1]; e.n += 1;
      });
    });
    var soundList = Object.keys(sounds).map(function (k) { return sounds[k]; }).filter(function (e) { return e.n >= 2; })
      .map(function (e) { return { key: e.key, label: (soundLabels && soundLabels[e.key]) || e.key, avg: Math.round(e.sum / e.n * 10) / 10, count: e.n }; })
      .sort(function (a, b) { return a.avg - b.avg; });

    var weak = Object.keys(review).filter(function (id) { return byId[id]; }).map(function (id) {
      var r = review[id];
      return { id: id, es: byId[id].es, deck: byId[id].deck, last_score: r.last_score, level: r.level, seen: r.seen };
    }).sort(function (a, b) { return a.last_score - b.last_score; });

    var ids = Object.keys(review);
    return {
      total_attempts: attempts.length,
      items_practised: ids.length,
      items_total: items.length,
      due_now: ids.filter(function (id) { return review[id].due <= now; }).length,
      mastered: ids.filter(function (id) { return review[id].level >= 3; }).length,
      daily: daily, sounds: soundList, weak_items: weak.slice(0, 15),
    };
  };

  // ------------------------------------------------------------ backup
  Store.prototype.exportJSON = function (includeKey) {
    var copy = JSON.parse(JSON.stringify(this.data));
    if (!includeKey) copy.settings.key = "";
    copy.exported = new Date().toISOString();
    return JSON.stringify(copy);
  };
  Store.prototype.importJSON = function (text) {
    var d;
    try { d = JSON.parse(text); } catch (e) { return "This file is not a backup from this program."; }
    if (!d || !Array.isArray(d.attempts) || typeof d.review !== "object") return "This file is not a backup from this program.";
    var keep = this.data.settings;
    this.data = Object.assign(emptyData(), d);
    this.data.settings = Object.assign(emptyData().settings, d.settings || {});
    if (!this.data.settings.key) { this.data.settings.key = keep.key; this.data.settings.region = this.data.settings.region || keep.region; }
    delete this.data.exported;
    this.save();
    return null;
  };

  Store.STORAGE_KEY = STORAGE_KEY;
  Store.INTERVALS = INTERVALS;
  if (typeof module !== "undefined" && module.exports) module.exports = Store;
  root.PracticeStore = Store;
})(typeof window !== "undefined" ? window : globalThis);
